# otel-shop

An e-commerce microservices monorepo built to demonstrate OpenTelemetry
observability. It exists to be instrumented, so the interesting parts are the
seams between services: an HTTP checkout that spans four of them, and a Kafka
settlement path where a trace has to survive a queue hop.

**There is no instrumentation yet.** That is the point. This branch is the
application, built so the next stages have something real to observe.

## Scope: the services, not the infrastructure

Only the services in this repo get instrumented (gateway, auth, cart, products
and payment). Postgres, Redis and Kafka are not monitored _as infrastructure_:
no exporters, no broker or database metrics, no uptime checks. They publish
their own metrics and a real deployment would collect them; that is just not
this project.

Calls **to** them are still in scope. Client side instrumentation stays on
(i.e `instrumentation-pg`, `instrumentation-redis` and `instrumentation-kafkajs`)
all run inside our services — so a query, a cache read and a publish each get a
span, on our side of the wire. What you will not see is the database's internal
state or the broker's own health.

The fake payment provider is excluded for a different reason: it stands in for
someone else's system, so even its application-level telemetry is not ours to
collect.

## Status

| Stage | What                                                                             | State    |
| ----- | -------------------------------------------------------------------------------- | -------- |
| 1     | Build the services                                                               | **done** |
| 2     | Observability backends (Loki, Prometheus, Tempo, Alloy, Grafana)                 | next     |
| 3     | Instrument the application                                                       |          |
| 4     | Sampling — head in the SDK, tail in the collector                                |          |
| 5     | Grafana as code — dashboards, contact points, notification policies, alert rules |          |

## Running it

Requires Docker and Node 24 (`.nvmrc`). Three secrets have no defaults, so
compose refuses to start without them. Create a `.env` beside
`docker-compose.yml`:

```sh
# an RSA private key, base64 encoded, for signing access tokens
JWT_PRIVATE_KEY_BASE64=...
# shared between payment and the fake provider, for webhook signatures
PAYMENT_WEBHOOK_SECRET=...
# shared between payment, cart and products, for service-to-service calls
INTERNAL_API_TOKEN=...
```

Generate the last two with `openssl rand -hex 32`. For the key:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  | openssl base64 -A
```

> On Windows, write `.env` as UTF-8 without a BOM. PowerShell's `>>` and
> `Out-File` default to encodings that compose silently fails to parse, which
> looks like a missing variable rather than a bad file.

Then:

```sh
docker compose up -d --build
```

Only the gateway is published, on **3000**. Everything else talks over the
compose network. Postgres for products is exposed on 5432 for the seed script.

Seed the catalogue once the stack is healthy:

```sh
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ecommerce-products-db \
  npm run seed -w @shop/products
```

That writes 300 deterministic products from a fixed PRNG seed, so everyone
following along gets the same prices and stock levels.

## Driving it

Every request goes through the gateway on 3000. Log in once and the
`access_token` cookie carries you through the rest, so any client that keeps
cookies works.

[`api.http`](./api.http) walks the whole path in order — signup, login, browse,
add to cart, check out, confirm the cart emptied — plus the error cases: out of
stock, a replayed idempotency key, and a revoked token. Open it with the
[REST Client](https://marketplace.cursorapi.com/items/?itemName=humao.rest-client)
extension and send the requests top to bottom.

The one thing worth knowing before you start: The payment is `pending` when you get the response; the provider reports the
outcome to payment's webhook a moment later, and that callback is what settles
the stock and clears the cart. Sending the same `x-idempotency-key` twice
returns the original payment instead of charging again.

For request shapes, read the zod validators in each service's
`src/validators/index.ts`. They are the only definition of what each endpoint
accepts.

### Making payments fail

The fake provider decides each outcome at random, so failures happen on their
own about one checkout in five. To make them deterministic, two optional
variables in `.env`:

```sh
SUCCESS_RATE=0        # 0 fails every payment, 1 succeeds every payment
CALLBACK_DELAY_MS=5000  # how long before the outcome arrives (default 1500)
```

Then restart just the provider:

```sh
docker compose up -d --no-deps payment-provider
```

A failed payment is worth watching because it exercises the compensating path:
products releases the reserved stock, the cart is left alone so you can retry,
and the payment row ends `failed`. Stretching `CALLBACK_DELAY_MS` makes the
pending window long enough to watch a reservation sit in `reserved` before
anything settles it — useful once there are traces to look at.

## The services

| Service          | Port | Owns                                                                     |
| ---------------- | ---- | ------------------------------------------------------------------------ |
| gateway          | 3000 | the only public entry point: proxying, rate limiting, token verification |
| auth             | 3001 | users, password hashing, RS256 access tokens, JWKS                       |
| cart             | 3002 | carts in Redis, one key per user                                         |
| products         | 3003 | catalogue and the stock reservation ledger (Postgres)                    |
| payment          | 3004 | payments, checkout orchestration, provider webhooks (Postgres)           |
| payment-provider | —    | a fake third party that succeeds or fails on request                     |

Shared code lives in `packages/`: `events` (the Kafka payload shapes and topic
names), `http` (the internal-token middleware), `jwt`, `logger`, `types` and
`utils`. Each is consumed through its built `dist`, so **run `npm run build`
once after cloning** or `typecheck` will fail on missing type declarations.

## The interesting path

A checkout touches four services synchronously, then hands off to Kafka:

```
POST /payments/checkout
  │
  ├─ cart      GET  /internal/cart/:userId     what is in the cart
  ├─ products  GET  /:id            (per item) what it costs *now*
  ├─ products  POST /internal/stock/reserve    hold the stock
  └─ provider  POST /payments                  accepted, outcome comes later
                                                   │
POST /webhooks/payments  ◄─────── HMAC-signed ─────┘
  │
  ├─ UPDATE payments SET status = ... WHERE status = 'pending'
  └─ publish → payment.succeeded | payment.failed
                   │
                   ├─ products  markSold / release stock
                   └─ cart      clear the cart (successes only)
```

Three things in there are deliberate and worth knowing before you read the code.

**The cart is re-priced before reserving, not after.** A cart can sit for days;
its prices are a display cache, not a quote. Products is asked for the current
price of every item, one request each. That N+1 is on purpose, it makes a
fan-out visible in a trace, which is the whole reason this repo exists.

**Stock moves at reserve, not at payment.** `reserve` decrements under a
`WHERE quantity >= ?` guard, so two concurrent checkouts on one unit produce a
422 rather than a negative quantity. The reservation ledger then tracks what
happens to that hold: `sold` is terminal, so neither a late release nor the
expiry sweeper can restock something already paid for.

**Settlement is asynchronous and the webhook does not wait for it.** The
handler commits the payment and publishes; products and cart act on their own.
Each consumes in its own group, so both see every message. Events carry their
state rather than an id, and are keyed by user, so one customer's events share
a partition and stay in order.

## Known gaps, on purpose

- **No transactional outbox.** The payment row is committed and _then_ the
  event published. A publish that fails after the commit leaves a payment
  settled with nothing downstream told. It is logged, not recovered.
- **`sequelize.sync()`, no migrations.** Didnt want you to run migratiosn
- **The expiry sweeper has no caller.** `expireStale` exists to document the
  reconciliation a production system would schedule, its never used.
- **Nothing below the services is instrumented.** Postgres, Redis, Kafka and
  the fake provider get no exporters. See the scope note above.

## Poking at it

```sh
# what is in the topics
docker compose exec kafka /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 \
  --topic-partitions payment.succeeded:0,payment.succeeded:1,payment.succeeded:2

# read the events
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic payment.succeeded \
  --from-beginning --formatter-property print.key=true --timeout-ms 10000

# did a reservation settle
docker compose exec products-postgres psql -U postgres -d ecommerce-products-db \
  -c "SELECT status, count(*) FROM stock_reservations GROUP BY status;"
```

The provider fails about 20% of payments (`SUCCESS_RATE`), so a handful of
checkouts will exercise both topics.

## Layout

```
packages/        events, http, jwt, logger, types, utils
services/        gateway, auth, cart, products, payment
fake-payment-provider/   plain JS, outside the workspace on purpose
docker-compose.yml
```

`npm run build`, `npm run typecheck` and `npm run dev` all fan out across every
workspace.
