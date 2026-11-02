import { RequestHandler, Router } from "express";

import { InternalStockController } from "../controllers/index.js";

export function createInternalRouter(
  controller: InternalStockController,
  internalAuthMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.use(internalAuthMiddleware);

  router.post("/stock/reserve", controller.reserve);
  router.post("/stock/release", controller.release);

  return router;
}
