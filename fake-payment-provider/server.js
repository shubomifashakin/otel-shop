// Stand-in for a third party payment provider.
//
// This is NOT part of the shop. In production it would be Stripe or Paystack:
// somebody else's deployment, which is why it is plain JavaScript, outside the
// npm workspace, and will never be instrumented. The only span that belongs to
// us is the client span the payment service emits when it calls in here.
//
// It either declines a charge outright, or answers 202 with a reference and then
// posts the outcome back to the callback url. Those two moments are controlled
// separately by INITIALIZE_ACCEPT_RATE and WEBHOOK_SUCCESS_RATE, so either can
// be forced to always or never happen without affecting the other.
import { createHmac, randomUUID } from "node:crypto";

import express from "express";

const PORT = Number(process.env.PORT ?? 4000);
const SECRET = process.env.WEBHOOK_SECRET;
const CALLBACK_DELAY_MS = Number(process.env.CALLBACK_DELAY_MS ?? 1500);
// how long every accept takes to answer. this is the duration the payment
// service's `payment.initialize` span measures, so it is the knob to turn when
// you want that span to be visibly slow. keep it under payment's 10s client
// timeout or every checkout fails instead.
const INITIALIZE_RESPONSE_DELAY_MS = Number(process.env.INITIALIZE_RESPONSE_DELAY_MS ?? 0);
// share of charges the provider agrees to take on at all. a refusal here is
// synchronous: payment compensates inside the checkout request and nothing is
// ever published, so kafka and the consumers never see it.
const INITIALIZE_ACCEPT_RATE = Number(process.env.INITIALIZE_ACCEPT_RATE ?? 0.8);
// share of accepted charges that go on to succeed. a failure here arrives later,
// on the callback, and is settled through the webhook and kafka.
const WEBHOOK_SUCCESS_RATE = Number(process.env.WEBHOOK_SUCCESS_RATE ?? 0.8);

if (!SECRET) {
  console.error("WEBHOOK_SECRET is required");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** posts the outcome back, retrying so the webhook's idempotency guard gets exercised */
async function deliver(callbackUrl, payload) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", SECRET).update(body).digest("hex");

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature },
        body,
        signal: AbortSignal.timeout(5000),
      });

      console.log(
        `callback ${payload.paymentId} ${payload.outcome} attempt ${attempt} -> ${response.status}`,
      );

      if (response.ok) return;
    } catch (err) {
      console.log(`callback ${payload.paymentId} attempt ${attempt} failed: ${err.message}`);
    }

    await sleep(attempt * 1000);
  }

  console.error(`callback ${payload.paymentId} gave up after 3 attempts`);
}

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/payments", async (req, res) => {
  const { paymentId, amount, currency, callbackUrl } = req.body ?? {};

  if (!paymentId || !amount || !currency || !callbackUrl) {
    return res
      .status(400)
      .json({ message: "paymentId, amount, currency and callbackUrl are required" });
  }

  // every request waits this long before answering, which is the duration
  // payment's `payment.initialize` span measures
  if (INITIALIZE_RESPONSE_DELAY_MS > 0) await sleep(INITIALIZE_RESPONSE_DELAY_MS);

  // the provider refuses the charge outright, so nothing is ever accepted
  if (Math.random() >= INITIALIZE_ACCEPT_RATE) {
    console.log(`payment ${paymentId} declined at initialization`);
    return res.status(502).json({ message: "provider declined the charge" });
  }

  const reference = `prov_${randomUUID().slice(0, 12)}`;
  const outcome = Math.random() < WEBHOOK_SUCCESS_RATE ? "succeeded" : "failed";

  console.log(`payment ${paymentId} accepted as ${reference}, will be ${outcome}`);

  // accepted, not charged: the outcome arrives on the callback
  res.status(202).json({ reference });

  // deliberately after the response, so the callback is a genuinely separate
  // request with no trace context of its own
  setTimeout(
    () => void deliver(callbackUrl, { paymentId, outcome, reference }),
    CALLBACK_DELAY_MS,
  );
});

const server = app.listen(PORT, () => {
  console.log(`fake payment provider listening on ${PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
