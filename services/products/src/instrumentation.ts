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

dotenv.config();

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

      // comment at cart service applies here also
      // but in this service we make database calls so those would appear as child spans
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
});

sdk.start();
