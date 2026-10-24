import { type RequestHandler } from "express";
import { LoggerPort } from "@shop/logger";

import { CachePort } from "../infrastructure/ports/index.js";

export function createRateLimitMiddleware(
  redis: CachePort,
  logger: LoggerPort,
  limit: number,
  windowMs: number,
): RequestHandler {
  const retryAfterSeconds = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    const key = `ratelimit:${req.ip ?? "unknown"}`;

    const result = await redis.allow(key, limit, windowMs);

    if (!result.success) {
      logger.error("Rate limit check failed, allowing request", {
        path: req.path,
        method: req.method,
        stack: result.error.stack,
        errMessage: result.error.message,
      });

      next();
      return;
    }

    if (!result.data) {
      logger.warn("Rate limit exceeded", { key, path: req.path });

      res.setHeader("Retry-After", retryAfterSeconds);
      res.status(429).json({ message: "Too many requests" });
      return;
    }

    next();
  };
}
