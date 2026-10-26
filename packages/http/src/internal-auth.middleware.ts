import { timingSafeEqual } from "node:crypto";

import { RequestHandler } from "express";

import { LoggerPort } from "@shop/logger";
import { UnauthorizedError } from "@shop/types";

export function createInternalAuthMiddleware(
  logger: LoggerPort,
  token: string,
): RequestHandler {
  const expected = Buffer.from(token, "utf8");

  return (req, _res, next) => {
    const provided = req.headers["x-internal-token"];

    if (typeof provided !== "string" || !provided.length) {
      logger.warn("Internal request arrived without a token", {
        method: req.method,
        path: req.originalUrl,
      });

      throw new UnauthorizedError();
    }

    const providedBuffer = Buffer.from(provided, "utf8");

    if (
      providedBuffer.length !== expected.length ||
      !timingSafeEqual(providedBuffer, expected)
    ) {
      logger.warn("Internal request token did not match", {
        method: req.method,
        path: req.originalUrl,
      });

      throw new UnauthorizedError();
    }

    next();
  };
}
