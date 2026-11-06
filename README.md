# otel-shop

An e-commerce microservices monorepo built to demonstrate OpenTelemetry
observability. It exists to be instrumented, so the interesting parts are the
seams between services: an HTTP checkout that spans four of them, and a Kafka
settlement path where a trace has to survive a queue hop.

**All five services are instrumented.** Traces, metrics and logs leave every
service over OTLP, through Alloy, into Tempo, Prometheus and Loki. Run a
checkout and you get one trace across four services, a second trace for the
provider's webhook, and the Kafka hop stitched to it by context propagated in
the message headers.

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

| Stage | What                                                                             | State       |
| ----- | -------------------------------------------------------------------------------- | ----------- |
| 1     | Build the services                                                               | **done**    |
| 2     | Observability backends (Loki, Prometheus, Tempo, Alloy, Grafana)                 | **done**    |
| 3     | Instrument the application                                                       | **done**    |
| 4     | Sampling — head in the application (`04a`), tail in Alloy (`04b`)                | **done**    |
| 5     | Grafana as code — dashboards, contact points, notification policies, alert rules | next        |

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

Three things are published to the host: the gateway on **3000**, Grafana on
**3005**, and Alloy's own UI on **12345**. Everything
else talks over the compose network. Postgres for products is exposed on **5432**
for the seed script.

Seed the catalogue once the stack is healthy:

```sh
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ecommerce-products-db \
  npm run seed -w @shop/products
```

That writes 300 deterministic products from a fixed PRNG seed, so everyone
following along gets the same prices and stock levels.

## The observability stack

Five containers come up alongside the services.

| Container  | Role                                         | Reach it at                           |
| ---------- | -------------------------------------------- | ------------------------------------- |
| alloy      | the OTel collector (everything is sent here) | UI on <http://localhost:12345>        |
| tempo      | traces                                       | via Grafana                           |
| loki       | logs                                         | via Grafana                           |
| prometheus | metrics                                      | via Grafana                           |
| grafana    | where you look at all three                  | <http://localhost:3005> (admin/admin) |

Configuration lives in [`backend_configs/`](./backend_configs), one file each.
The three datasources are provisioned from
[`grafana-datasources.yml`](./backend_configs/grafana-datasources.yml), so they
are connected the moment Grafana starts.

**Everything the services will emit goes to Alloy**, on 4317 (gRPC) or 4318
(HTTP), and Alloy fans it out: traces to Tempo, logs to Loki, metrics to
Prometheus. Those two ports are not published to the host, because the services
that use them run inside the compose network.

### Confirming it works

The quickest check is to run a checkout from [`api.http`](./api.http) and look
for it in Tempo. If nothing shows up, the generator below tells you whether the
problem is the application or the pipeline underneath it — it sends telemetry to
Alloy without involving any service, so if its output lands and yours doesn't,
the backends are fine and the instrumentation is the thing to look at.

It's behind a compose profile, so it never starts on a normal `up`:

```sh
# traces
docker compose --profile demo run --rm telemetrygen traces \
  --otlp-endpoint alloy:4317 --otlp-insecure --service demo-shop \
  --traces 5 --child-spans 3

# logs
docker compose --profile demo run --rm telemetrygen logs \
  --otlp-endpoint alloy:4317 --otlp-insecure --service demo-shop --logs 5

# metrics
docker compose --profile demo run --rm telemetrygen metrics \
  --otlp-endpoint alloy:4317 --otlp-insecure --service demo-shop --metrics 5
```

- Then open Grafana
- Login with the username and password (its `admin` unless you changed it to something else)
- Click on Explore and check each one:

| Datasource | Query                            | Expect                               |
| ---------- | -------------------------------- | ------------------------------------ |
| Tempo      | `{}` in the TraceQL tab          | traces rooted at `lets-go`           |
| Loki       | `{service_name="demo-shop"}`     | log lines reading `the message`      |
| Prometheus | `gen`                            | the generator's own metric           |
| Prometheus | `traces_spanmetrics_calls_total` | metrics Tempo derived from the spans |

The last row proves the most: those series only exist if the traces reached Tempo
**and** Tempo's remote-write reached Prometheus.

To see a log to trace correlation, send a log carrying a real traceId. Copy a traceId from one
of the tempo results and paste it in this commmand:

```sh
docker compose --profile demo run --rm telemetrygen logs \
  --otlp-endpoint alloy:4317 --otlp-insecure --service demo-shop \
  --logs 2 --trace-id 1576769ba0911ff5ebcdfd1c9032ac6c --body "linked log line"
```

Find it in Loki, expand the line, there should be a links tab that allows you to jump to the trace in tempo from there.

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

### Generating load

`api.http` is for reading one trace carefully. Sampling only means anything when
there are more traces than you can read, which is what
[`k6/scripts/load.js`](./k6/scripts/load.js) is for.

```sh
docker compose --profile load run --rm k6
```

**Raise the rate limit first.** The gateway allows 20 requests per minute per IP,
and a load generator is a single IP, so almost every request comes back 429 and
never reaches a service. In `.env`:

```sh
RATE_LIMIT_MAX=100000
RATE_LIMIT_WINDOW_MS=60000
```

Then `docker compose up -d gateway` to pick it up. The script counts 429s and
fails the run on the first one, so a forgotten limit shows up as a failed
threshold rather than as traffic that silently never happened.

Three scenarios run at once, and the mix is deliberate:

| Scenario   | Default rate | What it produces                                   |
| ---------- | ------------ | -------------------------------------------------- |
| `browse`   | 60/min       | fast reads — the bulk of the traffic               |
| `checkout` | 12/min       | the wide, slow trace with the N+1 and the provider |
| `faults`   | 6/min        | one 401, one 404 and one 422 per iteration         |

The faults matter as much as the successes. A tail sampling policy that keeps
errors has nothing to demonstrate against a run of pure 200s, and the three
errors deliberately fail at different depths: the 401 never leaves the gateway,
the 404 reaches products, and the 422 goes all the way down to the stock
reservation before failing.

Tune it with environment variables:

```sh
docker compose --profile load run --rm \
  -e DURATION=10m -e BROWSE_RATE=120 -e CHECKOUT_RATE=30 k6
```

### Making payments fail

The fake provider decides at random, so failures happen on their own without any
configuration. To make them deterministic, four optional variables in `.env`:

```sh
INITIALIZE_ACCEPT_RATE=1        # share of charges the provider accepts at all (default 0.8)
INITIALIZE_RESPONSE_DELAY_MS=2000  # how long it takes to answer a charge (default 2000)
WEBHOOK_SUCCESS_RATE=0          # share of accepted charges that then succeed (default 0.8)
CALLBACK_DELAY_MS=5000          # how long before the webhook arrives (default 1500)
```

The two delays are different moments and show up in different places.
`INITIALIZE_RESPONSE_DELAY_MS` is how long `POST /payments` takes to answer, so it is the
duration payment's `payment.initialize` span measures — turn it up and the
checkout trace gets visibly wider.
`CALLBACK_DELAY_MS` is how long it takes for the payment provider to send a response
to the `POST /webhooks/payments`
Keep `INITIALIZE_RESPONSE_DELAY_MS` under payment's 10s client timeout or every checkout fails.

Then restart just the provider:

```sh
docker compose up -d --no-deps payment-provider
```

A payment can fail at two separate moments, and each has its own rate so you can
force one without touching the other.

- **Declined at initialization** (`INITIALIZE_ACCEPT_RATE`) — the provider
  answers 502, so payment releases the stock and marks the row `failed` in the
  same request, synchronously, then answers 503. Nothing is published, so Kafka
  and the consumers never see it.
- **Accepted, then failed on the callback** (`WEBHOOK_SUCCESS_RATE`) — payment
  answers 201 with a `pending` row, and the compensation happens later, through
  the webhook and Kafka, with products releasing the stock in its consumer.

Both are worth looking at precisely because they produce such different traces:
the first is one connected trace ending in an error, the second is a successful
trace plus a separate webhook trace arriving seconds later.

So to exercise one path at a time:

```sh
# every charge declined up front, nothing reaches kafka
INITIALIZE_ACCEPT_RATE=0

# every charge accepted and then failed on the webhook callback
INITIALIZE_ACCEPT_RATE=1
WEBHOOK_SUCCESS_RATE=0

# every checkout succeeds end to end
INITIALIZE_ACCEPT_RATE=1
WEBHOOK_SUCCESS_RATE=1
```

## Sampling

### Head Sampling

Every service runs the same head sampler: a `TraceIdRatioBasedSampler` wrapped in
a `ParentBasedSampler`. One variable controls all five:

```sh
TRACE_RATIO=0.1   # keep 10% of traces (default 1, keep everything)
```

It is read once at startup, compose needs to recreate the services

```sh
docker compose up -d
```

**Only two services actually uuse it tho.** `ParentBasedSampler` consults the
ratio for root spans only; a span with a parent inherits whatever the parent
decided. That basically means:

- **gateway** — every user request enters through the gateway, so this is what decides the fate
  of all browsing and checkout traces
- **payment** — the provider's webhook arrives with no `traceparent` (the fake
  provider is not instrumented), so payment starts a fresh trace for it

auth, cart and products never see root spans. Their requests alwyas come from the gateway
so the trace context is always propagated to them. Because of that, `TRACE_RATIO` has no
effect on any of those, because `ParentBasedSampler` always goes with whatever decision the
parent decided `(i.e the gateway)`, if their parent was dropped, they would be dropped, and if it
was not, then you should see it appear in tempo. The moment any of these servcies start doing some work
that is independent of the gateway `(e.g like a cron job or something)` then it would
begin producing root spans and the `TRACE_RATIO` would be used there, but we have none of that
in this codebase, but it's something you can try for yourself.

### Watching it work

Set `TRACE_RATIO=0`, recreate, then drive some traffic from
[`api.http`](./api.http). Nothing should reach tempo. Two things should still happen, and
both are the point:

- **Loki still has your logs, with `trace_id` on every line.** A dropped span is
  still _created_ — it has a real trace id, it just is not recorded or exported.
  So the log keeps its link but the link does not lead anywehre since the traces were dropped.
  This is the seam you get whenever logs are kept at 100% and traces are not.
- **Prometheus keeps counting.** `payments_checkouts_total` and the
  `http_server_request_duration_seconds` histograms are aggregated in-process,
  before any sampler runs, so they are unaffected by sampling at any ratio.
  Exemplars do stop appearing, since those only attach to sampled spans.

A ratio between 0 and 1 is harder to confirm by hand, because you need to know
how many traces you sent before you can say what fraction survived. That is what
the [load generator](#generating-load) is for: it starts a fixed number of
iterations per minute regardless of how the system responds, so the denominator
is a number you chose rather than one you have to go and measure. Run it for
five minutes at the defaults and you sent 300 browse traces, set
`TRACE_RATIO=0.1` and Tempo should hold roughly thirty of them.

> **Put `TRACE_RATIO` back to `1` before going further.** Everything below this
> point assumes it. Head sampling is unconditional and happens at the source, so
> anything it drops never reaches the tail sampler at all and a policy that says
> "keep every error" cannot keep an error it was never sent. Leave the ratio at
> `0.1` and you are not sampling 10% and then filtering, you are filtering 10% of
> your traffic and blindly discarding the other 90%, errors included. The two
> compound, and the tail policies are the ones doing the useful work.

### Tail Sampling

Head sampling decides at the moment a trace starts, before anything has happened.
That is cheap and it is why the decision propagates so cleanly, but it operates blindly.
A trace that was going to fail is thrown away with the same indifference as one
that was going to succeed, because at the point of the decision neither had
happened yet.

Tail sampling waits for the trace to be complete before making a decision,
It contains the duration, the outcome and every attribute attached. That
is how you keep every error while throwing away most of the traffic.

It lives in Alloy, in [`config.alloy`](./backend_configs/config.alloy), because
Alloy is the one place every span passes through.

```hcl
decision_wait = "30s"
```

This is a **timer, not a completeness check**. Alloy cannot know how many spans a
trace will have, so it starts a timer when the first one arrives and evaluates
whatever it has when the timer runs out. If a timer that is too short and a span
arrives after that, the decision misses it entirely. An error at second 35 against
a 30s window is never seen, and the trace was already judged healthy and dropped. Too long and
every in-flight trace sits in memory that whole time.

Four policies are in place:

| Policy       | Type            | What it does                                   |
| ------------ | --------------- | ---------------------------------------------- |
| `drop-noise` | `drop`          | throws away health check and metrics endpoints |
| `errors`     | `status_code`   | keeps every trace containing an `ERROR` span   |
| `slow`       | `latency`       | keeps every trace over 2s, measured end to end |
| `baseline`   | `probabilistic` | keeps 10% of everything else                   |

**How they combine:** every policy is evaluated and the votes are tallied. A
`drop` vote always wins. Otherwise a single keep vote is enough. **Nothing voting
keep means the trace is discarded**, the default is drop, so a trace that matches
no policy is gone forever. The `baseline` policy exists for exactly that reason: without
it, a perfectly healthy checkout would never reach Tempo and you would have no
example of a working trace to look at.

#### The thing that will surprise you

**A 4xx is not an error** — not on the span that served it. OpenTelemetry marks a
SERVER span as `ERROR` only at `>= 500`, because a 404 is the server working
correctly: it was asked for something that does not exist and said so. CLIENT
spans use `>= 400`, because from the caller's side the request failed.

So a 404 produces an error on the _caller's_ span, not the callee's. Request a
product that does not exist and the gateway's client span is flagged while
products' own server span stays `UNSET`. Both are in the same trace, so the
`errors` policy keeps it — but for a reason that is one step removed from where
you would look.

The case where this bites: **an unauthorised request is invisible to the `errors`
policy.** The gateway rejects it at the edge, so nothing is proxied and there is
no client span, and the server span is 401 which is not an error. Nothing in that
trace is flagged. It survives only if `baseline` happens to pick it.

The second source of `ERROR` is a thrown exception — the Express instrumentation
flags any handler that throws. That is why the 404 shows a red `request handler`
span too: products' service throws `NotFoundError`. The gateway's auth middleware
answers with `res.status(401)` and returns instead of throwing, so nothing is
flagged. Thrown errors are visible, handled ones are not.

#### What tail sampling broke, and how it was fixed

Tempo used to derive span metrics and service graphs from the traces it received.
That stops working the moment you tail sample, and the failure is worse than
losing precision.

Uniform sampling would only make the numbers small — keep 10% of everything and
every rate is 10× low, but the shape survives. Tail sampling is deliberately
**not** uniform: it keeps 100% of errors and 10% of successes. Metrics derived
from what survives would read an error rate of roughly 50% when reality is 9%.
Not imprecise, actively wrong, and wrong in the direction that looks like an
outage.

So generation moved upstream of the sampler. Tempo's `metrics_generator` is gone,
and `otelcol.connector.spanmetrics` and `otelcol.connector.servicegraph` now sit
on the receiver's output alongside the tail sampler rather than behind it. They
see every span; only the trace path is sampled. **Count first, then throw spans
away.**

The metric names are unchanged, so nothing downstream noticed. Two settings exist
purely to keep it that way: `namespace = "traces.spanmetrics"` on the span metrics
connector, because its default would have produced `traces_span_metrics_*`, and a
corrected `virtual_node_peer_attributes` on the service graph connector, because
the defaults look for `db.name` and `db.system` while the current semantic
conventions emit `db.namespace` and `db.system.name` — leaving them alone would
have quietly dropped Postgres and Redis off the graph entirely.

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

## Layout

```
packages/        events, http, jwt, logger, types, utils
services/        gateway, auth, cart, products, payment
fake-payment-provider/   plain JS, outside the workspace on purpose
docker-compose.yml
```

`npm run build`, `npm run typecheck` and `npm run dev` all fan out across every
workspace.
