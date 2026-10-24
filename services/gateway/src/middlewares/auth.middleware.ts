import { RequestHandler } from "express";

import { LoggerPort } from "@shop/logger";
import { TokenVerifierPort } from "@shop/jwt";
import { generateBlacklistKey } from "@shop/utils";
import { CachePort } from "../infrastructure/ports/index.js";

export function createAuthMiddleware(
  logger: LoggerPort,
  tokenVerifier: TokenVerifierPort,
  cacheService: CachePort,
): RequestHandler {
  return async (req, res, next) => {
    const accessToken = req.cookies?.["access_token"];

    if (typeof accessToken !== "string" || !accessToken.length) {
      res.status(401).json({ message: "Unauthorized" });

      return;
    }

    const result = await tokenVerifier.verify(accessToken);

    if (!result.ok) {
      if (result.reason === "unavailable") {
        logger.error("Could not verify access token", result.error);

        res.status(503).json({ message: "Service unavailable" });
        return;
      }

      logger.warn("Rejected access token", {
        method: req.method,
        path: req.originalUrl,
        errMessage: result.error.message,
      });

      res.status(401).json({ message: "Unauthorized" });

      return;
    }

    const blacklisted = await cacheService.get<string>(
      generateBlacklistKey(result.claims.jti),
    );

    if (blacklisted.data) {
      res.status(401).json({ message: "Unauthorized" });

      return;
    }

    if (!blacklisted.success) {
      logger.error(
        "Failed to check if token was blacklisted",
        blacklisted.error,
      );
    }

    next();
  };
}
