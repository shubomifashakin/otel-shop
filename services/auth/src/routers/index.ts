import { Router } from "express";

import { AuthController } from "../controllers/index.js";

export * from "./jwks.router.js";

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post("/signup", controller.signup);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);

  return router;
}
