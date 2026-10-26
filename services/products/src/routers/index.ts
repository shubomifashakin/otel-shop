export * from "./internal.router.js";

import { Router } from "express";
import { ProductsController } from "../controllers/index.js";

export function createProductsRouter(controller: ProductsController): Router {
  const router = Router();

  router.get("/", controller.getList);
  router.get("/:id", controller.getOne);

  return router;
}
