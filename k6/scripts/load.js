import http, { CookieJar } from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import exec from "k6/execution";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DURATION = __ENV.DURATION || "5m";

// arrival rates, per minute. these are what decide how many traces you get,
// which is the number you want to know when checking whether TRACE_RATIO=0.1
// really kept about a tenth of them
const BROWSE_RATE = Number(__ENV.BROWSE_RATE || 60);
const CHECKOUT_RATE = Number(__ENV.CHECKOUT_RATE || 12);
const FAULT_RATE = Number(__ENV.FAULT_RATE || 6);

const PASSWORD = "Observe!123";

const PRODUCT_COUNT = 300;

const JSON_HEADERS = { "Content-Type": "application/json" };

const checkoutAccepted = new Rate("otel_shop_checkout_accepted");
const checkoutDuration = new Trend("otel_shop_checkout_duration", true);
const faultsGenerated = new Counter("otel_shop_faults_generated");
const rateLimited = new Counter("otel_shop_rate_limited");

export const options = {
  scenarios: {
    browse: {
      executor: "constant-arrival-rate",
      rate: BROWSE_RATE,
      timeUnit: "1m",
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 40,
      exec: "browse",
    },
    checkout: {
      executor: "constant-arrival-rate",
      rate: CHECKOUT_RATE,
      timeUnit: "1m",
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: "checkout",
    },
    faults: {
      executor: "constant-arrival-rate",
      rate: FAULT_RATE,
      timeUnit: "1m",
      duration: DURATION,
      preAllocatedVUs: 3,
      maxVUs: 10,
      exec: "faults",
    },
  },

  thresholds: {
    otel_shop_rate_limited: ["count<1"],

    checks: ["rate>0.95"],

    "http_req_failed{kind:browse}": ["rate<0.01"],
    "http_req_duration{kind:browse}": ["p(95)<800"],

    otel_shop_checkout_accepted: ["rate>0.5"],
  },
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function inStockProductId() {
  const id = randomInt(1, PRODUCT_COUNT);
  return id % 10 === 1 ? id + 1 : id;
}

function outOfStockProductId() {
  return randomInt(0, Math.floor((PRODUCT_COUNT - 1) / 10)) * 10 + 1;
}

function track(res) {
  if (res.status === 429) {
    rateLimited.add(1);
  }

  return res;
}

let session = null;

// every VU gets its own account, because carts are per user.
function ensureSession() {
  if (session) {
    return session;
  }

  const vu = exec.vu.idInTest;
  const email = `k6-user-${vu}@otel-shop.test`;

  const phone = `+234801${String(vu).padStart(7, "0")}`;

  track(
    http.post(
      `${BASE_URL}/auth/signup`,
      JSON.stringify({
        email,
        phone,
        password: PASSWORD,
        firstName: "load",
        lastName: "tester",
      }),
      {
        headers: JSON_HEADERS,
        tags: { kind: "session", name: "POST /auth/signup" },
      },
    ),
  );

  const res = track(
    http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password: PASSWORD }),
      {
        headers: JSON_HEADERS,
        tags: { kind: "session", name: "POST /auth/login" },
      },
    ),
  );

  if (!check(res, { "login succeeded": (r) => r.status === 200 })) {
    fail(`login failed for ${email}: ${res.status} ${res.body}`);
  }

  session = { email, vu };

  return session;
}

export function setup() {
  const res = http.get(`${BASE_URL}/products`, { timeout: "5s" });

  if (res.status === 429) {
    fail(
      "the gateway rate limited the very first request. raise the limit in " +
        "services/gateway/src/bootstrap.ts (currently 20 requests per minute " +
        "per IP) before running a load test",
    );
  }

  if (res.status !== 200) {
    fail(`gateway is not answering at ${BASE_URL}: ${res.status}`);
  }
}

export function browse() {
  ensureSession();

  track(
    http.get(`${BASE_URL}/products`, {
      tags: { kind: "browse", name: "GET /products" },
    }),
  );

  sleep(randomInt(1, 4) / 10);

  track(
    http.get(`${BASE_URL}/products/${inStockProductId()}`, {
      tags: { kind: "browse", name: "GET /products/:id" },
    }),
  );
  sleep(randomInt(1, 4) / 10);

  track(
    http.get(`${BASE_URL}/cart`, {
      tags: { kind: "browse", name: "GET /cart" },
    }),
  );
}

export function checkout() {
  ensureSession();

  track(
    http.del(`${BASE_URL}/cart`, null, {
      tags: { kind: "checkout", name: "DELETE /cart" },
    }),
  );

  const lines = randomInt(1, 8);

  for (let i = 0; i < lines; i++) {
    track(
      http.post(
        `${BASE_URL}/cart/items`,
        JSON.stringify({
          productId: inStockProductId(),
          quantity: randomInt(1, 2),
        }),
        {
          headers: JSON_HEADERS,
          tags: { kind: "checkout", name: "POST /cart/items" },
        },
      ),
    );
  }

  const idempotencyKey = `k6-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;

  const res = track(
    http.post(`${BASE_URL}/payments/checkout`, null, {
      headers: { "x-idempotency-key": idempotencyKey },
      tags: { kind: "checkout", name: "POST /payments/checkout" },
    }),
  );

  checkoutAccepted.add(res.status === 201);
  checkoutDuration.add(res.timings.duration);

  if (
    !check(res, {
      "checkout resolved": (r) => [201, 422, 503].includes(r.status),
    })
  ) {
    console.warn(`unexpected checkout status ${res.status}: ${res.body}`);
  }

  sleep(randomInt(1, 4) / 10);

  track(
    http.get(`${BASE_URL}/payments`, {
      tags: { kind: "checkout", name: "GET /payments" },
    }),
  );
}

export function faults() {
  // unauthorized user trying to get cart
  const anonymous = new CookieJar();

  track(
    http.get(`${BASE_URL}/cart`, {
      jar: anonymous,
      tags: { kind: "fault", name: "GET /cart (unauthenticated)" },
    }),
  );
  faultsGenerated.add(1, { fault: "unauthorized" });

  sleep(randomInt(1, 4) / 10);

  // user trying to get a nonexistent product
  track(
    http.get(`${BASE_URL}/products/999999`, {
      tags: { kind: "fault", name: "GET /products/:id (missing)" },
    }),
  );
  faultsGenerated.add(1, { fault: "not_found" });

  sleep(randomInt(1, 4) / 10);

  // user trying to checkout an out of stocck product
  ensureSession();

  track(
    http.del(`${BASE_URL}/cart`, null, {
      tags: { kind: "fault", name: "DELETE /cart" },
    }),
  );

  track(
    http.post(
      `${BASE_URL}/cart/items`,
      JSON.stringify({ productId: outOfStockProductId(), quantity: 1 }),
      {
        headers: JSON_HEADERS,
        tags: { kind: "fault", name: "POST /cart/items (out of stock)" },
      },
    ),
  );

  const res = track(
    http.post(`${BASE_URL}/payments/checkout`, null, {
      headers: {
        "x-idempotency-key": `k6-oos-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`,
      },
      tags: { kind: "fault", name: "POST /payments/checkout (out of stock)" },
    }),
  );

  if (
    !check(res, { "out of stock checkout rejected": (r) => r.status === 422 })
  ) {
    console.warn(
      `expected 422 from the out of stock checkout, got ${res.status}: ${res.body}`,
    );
  }

  faultsGenerated.add(1, { fault: "out_of_stock" });
}
