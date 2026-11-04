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
import {
  AggregationType,
  InstrumentType,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
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

  // sends logs out in batches to our otel collector
  logRecordProcessors: [
    new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
  ],

  // sends traces to our otel collector
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

      // this is responsible for capturing logs written by winston
      // its enabled by default, but i added this explictly just so you understand how it works
      "@opentelemetry/instrumentation-winston": {
        enabled: true,
        // we configure the otel transport ourselves in @shop/logger, so we turn off
        // log sending here, otherwise this appends a second transport and every
        // logs lands in loki twice
        disableLogSending: true,
      },

      "@opentelemetry/instrumentation-http": {
        // never record requests made to the /healthz endpoint
        // beause its of no benefit
        ignoreIncomingRequestHook: (req) => req.url === "/healthz",
        enabled: true,
      },
    }),
  ],

  // the default bucket boundaries use milliseconds, so a
  // value in seconds would land entirely in the first bucket.
  // this is a way to override the default boundaries
  views: [
    {
      instrumentName: "auth.password.hash.duration",
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: {
          boundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        },
      },
      instrumentType: InstrumentType.HISTOGRAM,
    },
  ],

  // adds the following as attributes to all telemetry data
  // it merges the already existing defaults with these
  // all attributes specified in OTEL_RESOURCE_ATTRIBUTES env var are included also (thanks to the envDetector)
  // i only added this here to give an example for a case where you wanted to add attributes in code
  // using OTEL_SERVICE_NAME in env would do the same job
  resource: defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME!,
    }),
  ),

  // containerDetector automatically gets the container id
  // when you use the reseource detectors property you need to configure all detectors you want
  // otherwise they would be dropped
  resourceDetectors: [containerDetector, envDetector],

  // HEAD BASED SAMPLING
  // for spans with a parent it would respect the sampling decisions and our configured sampler would not run
  // but for spans without a parent (root spans) it would run the TraceIdRatioBasedSampler we have configured
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(traceRatio),
  }),
});

sdk.start();
