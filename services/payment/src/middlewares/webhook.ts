import { createHmac, timingSafeEqual } from "node:crypto";

import { RequestHandler } from "express";

import { LoggerPort } from "@shop/logger";
import { UnauthorizedError } from "@shop/types";
import { webhookVerifications } from "../telemetry/metrics.js";

export function createWebhookSignatureMiddleware(
  logger: LoggerPort,
  secret: string,
): RequestHandler {
  return (req, _res, next) => {
    const provided = req.headers["x-signature"];

    if (typeof provided !== "string" || !provided.length) {
      logger.warn("Webhook arrived without a signature", {
        path: req.originalUrl,
      });

      webhookVerifications.add(1, { outcome: "missing_signature" });

      throw new UnauthorizedError();
    }

    if (!req.rawBody) {
      logger.error("Webhook raw body was not captured", {
        path: req.originalUrl,
      });

      webhookVerifications.add(1, { outcome: "no_raw_body" });

      throw new UnauthorizedError();
    }

    const expected = createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      logger.warn("Webhook signature did not match", {
        path: req.originalUrl,
      });

      webhookVerifications.add(1, { outcome: "mismatch" });

      throw new UnauthorizedError();
    }

    webhookVerifications.add(1, { outcome: "valid" });

    next();
  };
}
