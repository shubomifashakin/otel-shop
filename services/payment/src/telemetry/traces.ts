import { trace } from "@opentelemetry/api";

export const tracer = trace.getTracer("payments", "1.0.0");
