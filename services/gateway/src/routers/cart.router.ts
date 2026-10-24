import { RequestHandler, Router } from "express";

export function createCartRouter(
  proxy: RequestHandler,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.use(authMiddleware, proxy);

  return router;
}
