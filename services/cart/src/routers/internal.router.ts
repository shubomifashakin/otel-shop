import { RequestHandler, Router } from "express";

import { InternalCartController } from "../controllers/index.js";

export function createInternalRouter(
  controller: InternalCartController,
  internalAuthMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.use(internalAuthMiddleware);

  router.get("/cart/:userId", controller.getCart);

  return router;
}
