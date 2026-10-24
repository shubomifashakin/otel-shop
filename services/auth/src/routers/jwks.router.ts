import { Router } from "express";

import { LoggerPort } from "@shop/logger";

import { TokenSignerPort } from "../infrastructure/ports/index.js";

export function createJwksRouter(
  tokenSigner: TokenSignerPort,
  logger: LoggerPort,
): Router {
  const router = Router();

  router.get("/jwks.json", async (_req, res) => {
    const result = await tokenSigner.jwks();

    if (!result.success) {
      logger.error("Could not generate the key set", result.error);

      res.status(500).json({ message: "Internal server error" });

      return;
    }

    res.set("Cache-Control", "public, max-age=300");

    res.status(200).json(result.data);

    return;
  });

  return router;
}
