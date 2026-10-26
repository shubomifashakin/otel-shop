import { RequestHandler } from "express";

import { LoggerPort } from "@shop/logger";
import { TokenVerifierPort } from "@shop/jwt";
import { ServiceUnavailableError, UnauthorizedError } from "@shop/types";
import { generateBlacklistKey } from "@shop/utils";

import { CachePort } from "../infrastructure/ports/index.js";

export function createAuthMiddleware(
  logger: LoggerPort,
  tokenVerifier: TokenVerifierPort,
  cache: CachePort,
): RequestHandler {
  return async (req, _res, next) => {
    const accessToken = req.cookies?.["access_token"];

    if (typeof accessToken !== "string" || !accessToken.length) {
      throw new UnauthorizedError();
    }

    const result = await tokenVerifier.verify(accessToken);

    if (!result.ok) {
      if (result.reason === "unavailable") {
        logger.error("Could not verify the access token", result.error);

        throw new ServiceUnavailableError("Could not verify the access token");
      }

      logger.warn("Rejected an access token", {
        method: req.method,
        path: req.originalUrl,
        errMessage: result.error.message,
      });

      throw new UnauthorizedError();
    }

    const revoked = await cache.get<string>(
      generateBlacklistKey(result.claims.jti),
    );

    if (revoked.data) {
      logger.warn("Rejected a revoked access token", {
        method: req.method,
        path: req.originalUrl,
      });

      throw new UnauthorizedError();
    }

    if (!revoked.success) {
      logger.error("Failed to check the revocation list", revoked.error);
    }

    req.user = { id: result.claims.sub };

    next();
  };
}
