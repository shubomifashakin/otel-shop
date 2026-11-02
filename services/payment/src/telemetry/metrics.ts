import { metrics } from "@opentelemetry/api";
const meter = metrics.getMeter("payments", "1.0.0");

export const totalErrors = meter.createCounter("payments.errors", {
  description: "Total unexpected errors",
});

export const webhookVerifications = meter.createCounter(
  "payments.webhook.verifications",
  { description: "Total webhook verifications" },
);

export const checkouts = meter.createCounter("payments.checkouts", {
  description: "Checkout attempts by outcome",
});
