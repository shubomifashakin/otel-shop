import { RequestHandler, Router } from "express";

export function createProductsRouter(proxy: RequestHandler): Router {
  const router = Router();

  router.use(proxy);

  return router;
}
