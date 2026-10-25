import { createLogger } from "@shop/logger";
import { createTokenVerifier } from "@shop/jwt";

import { parsed } from "./config/index.js";
import { createRedis } from "./infrastructure/clients/index.js";
import { createApp } from "./app.js";
import { CartService } from "./services/index.js";
import { CartController } from "./controllers/index.js";
import { createCartRouter } from "./routers/index.js";
import {
  createAuthMiddleware,
  createErrorMiddleware,
} from "./middlewares/index.js";
import {
  RedisCacheAdapter,
  HttpProductsAdapter,
} from "./infrastructure/adapters/index.js";

export async function bootstrap() {
  const logger = createLogger(parsed.SERVICE_NAME, parsed.LOG_LEVEL);

  const redis = await createRedis(
    parsed.REDIS_URL,
    parsed.SERVICE_NAME,
    logger,
  );

  const redisAdapter = new RedisCacheAdapter(redis);

  const productsAdapter = new HttpProductsAdapter(
    parsed.PRODUCTS_SERVICE_URL,
    3 * 1000,
  );

  const tokenVerifier = createTokenVerifier({
    jwksUrl: parsed.AUTH_JWKS_URL,
    issuer: parsed.JWT_ISSUER,
    audience: parsed.JWT_AUDIENCE,
    timeoutMs: 10 * 1000,
  });

  await tokenVerifier.warmUp();

  const errorMiddleware = createErrorMiddleware(logger);
  const authMiddleware = createAuthMiddleware(
    logger,
    tokenVerifier,
    redisAdapter,
  );

  const cartService = new CartService(logger, redisAdapter, productsAdapter);

  const cartController = new CartController(cartService);

  const cartsRouter = createCartRouter(cartController, authMiddleware);

  const app = createApp({
    errorMiddleware,
    routers: [{ path: "/", router: cartsRouter }],
  });

  return { app, logger, redis, config: parsed };
}
