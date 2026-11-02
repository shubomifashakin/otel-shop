import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("products", "1.0.0");

export const totalErrors = meter.createCounter("products.errors", {
  description: "Total unexpected errors",
});
