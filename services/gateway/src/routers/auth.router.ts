import { RequestHandler, Router } from "express";

export function createAuthRouter(proxy: RequestHandler): Router {
  const router = Router();

  router.use(proxy);

  return router;
}
