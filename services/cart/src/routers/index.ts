import { RequestHandler, Router } from "express";
import { CartController } from "../controllers/index.js";

export function createCartRouter(
  controller: CartController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  // every cart route is per-user, so there is nothing here to leave public
  router.use(authMiddleware);

  router.get("/", controller.getItems);
  router.delete("/", controller.clear);
  router.post("/items", controller.addItem);
  router.patch("/items/:id", controller.updateItem);
  router.delete("/items/:id", controller.removeItem);

  return router;
}
