import dotenv from "dotenv";

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  envDetector,
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace";

dotenv.config();

const parsedTraceRatio = Number.parseFloat(process.env.TRACE_RATIO ?? "1");
const traceRatio = Number.isFinite(parsedTraceRatio) ? parsedTraceRatio : 1;

export const sdk = new NodeSDK({
  autoDetectResources: true,

  logRecordProcessors: [
    new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
  ],

  traceExporter: new OTLPTraceExporter({
    timeoutMillis: 10 * 1000,
  }),

  metricReaders: [
    new PeriodicExportingMetricReader({
      exportIntervalMillis: 30 * 1000,
      exporter: new OTLPMetricExporter({ timeoutMillis: 10 * 1000 }),
    }),
  ],

  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-host-metrics": { enabled: false },

      "@opentelemetry/instrumentation-winston": {
        enabled: true,
        disableLogSending: true,
      },

      "@opentelemetry/instrumentation-http": {
        ignoreIncomingRequestHook: (req) => req.url === "/healthz",
        enabled: true,
      },

      // auto instrumentation for kafkajs library. this service only consumes, it never produces.
      // for every message it reads the traceparent header the payment service wrote on publish and
      // starts a "process" span parented to it, so clearing the cart shows up in the same
      // trace as the webhook event that caused the message to be published. the redis calls our
      // handler makes appear as child spans too.
      // more info on context propagation here: https://opentelemetry.io/docs/concepts/context-propagation/
      "@opentelemetry/instrumentation-kafkajs": {
        enabled: true,
      },
    }),
  ],

  resource: defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME!,
    }),
  ),

  resourceDetectors: [containerDetector, envDetector],

  // HEAD BASED SAMPLING
  // for spans with a parent it would respect the sampling decisions and our configured sampler would not run
  // but for spans without a parent (root spans) it would run the TraceIdRatioBasedSampler we have configured
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(traceRatio),
  }),
});

sdk.start();
