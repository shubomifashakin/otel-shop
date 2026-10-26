// Stand-in for a third party payment provider.
//
// This is NOT part of the shop. In production it would be Stripe or Paystack:
// somebody else's deployment, which is why it is plain JavaScript, outside the
// npm workspace, and will never be instrumented. The only span that belongs to
// us is the client span the payment service emits when it calls in here.
//
// It accepts a charge, answers 202 with a reference, and then posts the outcome
// back to the callback url. The outcome is random by default, and forceable with
// an `x-simulate` header so a specific trace can be reproduced on demand.
import { createHmac, randomUUID } from "node:crypto";

import express from "express";

const PORT = Number(process.env.PORT ?? 4000);
const SECRET = process.env.WEBHOOK_SECRET;
const CALLBACK_DELAY_MS = Number(process.env.CALLBACK_DELAY_MS ?? 1500);
const SLOW_RESPONSE_MS = Number(process.env.SLOW_RESPONSE_MS ?? 8000);
const SUCCESS_RATE = Number(process.env.SUCCESS_RATE ?? 0.8);

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

  // success | fail | slow | timeout | reject, else random
  const simulate = req.headers["x-simulate"];

  // never answers: this is what payment's request timeout is for, and it leaves
  // the payment pending rather than failed, because the charge may have landed
  if (simulate === "timeout") {
    console.log(`payment ${paymentId} simulating a timeout`);
    return;
  }

  // the provider refuses the request outright, so nothing is charged
  if (simulate === "reject") {
    console.log(`payment ${paymentId} rejected`);
    return res.status(502).json({ message: "provider declined the request" });
  }

  if (simulate === "slow") await sleep(SLOW_RESPONSE_MS);

  const reference = `prov_${randomUUID().slice(0, 12)}`;
  const outcome =
    simulate === "success"
      ? "succeeded"
      : simulate === "fail"
        ? "failed"
        : Math.random() < SUCCESS_RATE
          ? "succeeded"
          : "failed";

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
