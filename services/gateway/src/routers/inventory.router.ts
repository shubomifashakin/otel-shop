import { RequestHandler, Router } from "express";

export function createInventoryRouter(proxy: RequestHandler): Router {
  const router = Router();

  router.use(proxy);

  return router;
}
