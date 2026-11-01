import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("@shop/auth", "1.0.0");

// this is a counter and it can only go up
export const loginAttempts = meter.createCounter("auth.login.attempts", {
  description: "Login attempts by outcome",
});

export const passwordHashDuration = meter.createHistogram(
  "auth.password.hash.duration",
  {
    description: "Time spent hashing or verifying a password",
    unit: "s",
  },
);

export const totalErrors = meter.createCounter("auth.errors", {
  description: "Total unexpected errors",
});
