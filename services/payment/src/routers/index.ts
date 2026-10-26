import { RequestHandler, Router } from "express";
import { PaymentsController } from "../controllers/index.js";

export * from "./webhooks.router.js";

export function createPaymentsRouter(
  controller: PaymentsController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get("/", controller.getPayments);
  router.post("/checkout", controller.checkout);

  return router;
}
