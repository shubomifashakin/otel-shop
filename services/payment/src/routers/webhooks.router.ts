import { RequestHandler, Router } from "express";

import { WebhooksController } from "../controllers/index.js";

export function createWebhooksRouter(
  controller: WebhooksController,
  signatureMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.post("/payments", signatureMiddleware, controller.providerWebhook);

  return router;
}
