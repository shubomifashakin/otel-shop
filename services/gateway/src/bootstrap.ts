import { parsed } from "./config/index.js";
import { type Request, type Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

import { createLogger } from "@shop/logger";
import { createTokenVerifier } from "@shop/jwt";

import { createApp } from "./app.js";
import { createRedis } from "./infrastructure/clients/index.js";
import {
  createAuthMiddleware,
  createErrorMiddleware,
  createProxyErrorHandler,
  createRateLimitMiddleware,
} from "./middlewares/index.js";
import { RedisCacheAdapter } from "./infrastructure/adapters/index.js";
import {
  createAuthRouter,
  createPaymentRouter,
  createCartRouter,
  createProductsRouter,
} from "./routers/index.js";

export async function bootstrap() {
  // setup clients
  const logger = createLogger(parsed.SERVICE_NAME, parsed.LOG_LEVEL);
  const redis = await createRedis(
    parsed.REDIS_URL,
    parsed.SERVICE_NAME,
    logger,
  );

  // setup adapters
  const redisCacheAdapter = new RedisCacheAdapter(redis);
  const jwtVerifier = createTokenVerifier({
    jwksUrl: parsed.AUTH_JWKS_URL,
    audience: parsed.JWT_AUDIENCE,
    issuer: parsed.JWT_ISSUER,
    timeoutMs: 10 * 1000,
  });

  // load public keys on startup
  await jwtVerifier.warmUp();

  // setup middlewares
  const globalRateLimitMiddleware = createRateLimitMiddleware(
    redisCacheAdapter,
    logger,
    parsed.RATE_LIMIT_MAX,
    parsed.RATE_LIMIT_WINDOW_MS,
  );
  const globalErrorMiddleware = createErrorMiddleware(logger);
  const authMiddleware = createAuthMiddleware(
    logger,
    jwtVerifier,
    redisCacheAdapter,
  );
  const proxyErrorHandler = createProxyErrorHandler(logger);

  // setup proxies
  const authProxy = createProxyMiddleware<Request, Response>({
    logger: logger,
    changeOrigin: true,
    timeout: 120 * 1000,
    proxyTimeout: 5 * 1000,
    target: parsed.AUTH_SERVICE_URL,
    on: { error: proxyErrorHandler },
  });

  const productsProxy = createProxyMiddleware<Request, Response>({
    logger: logger,
    changeOrigin: true,
    timeout: 120 * 1000,
    proxyTimeout: 30 * 1000,
    target: parsed.PRODUCTS_SERVICE_URL,
    on: { error: proxyErrorHandler },
  });

  const cartProxy = createProxyMiddleware<Request, Response>({
    logger: logger,
    changeOrigin: true,
    timeout: 120 * 1000,
    proxyTimeout: 10 * 1000,
    target: parsed.CART_SERVICE_URL,
    on: { error: proxyErrorHandler },
  });

  const paymentProxy = createProxyMiddleware<Request, Response>({
    logger: logger,
    changeOrigin: true,
    timeout: 120 * 1000,
    proxyTimeout: 60 * 1000,
    target: parsed.PAYMENT_SERVICE_URL,
    on: { error: proxyErrorHandler },
  });

  const authRouter = createAuthRouter(authProxy);
  const productsRouter = createProductsRouter(productsProxy);
  const cartRouter = createCartRouter(cartProxy, authMiddleware);
  const paymentRouter = createPaymentRouter(paymentProxy, authMiddleware);

  const app = createApp({
    globalRateLimitMiddleware,
    errorMiddleware: globalErrorMiddleware,
    routers: [
      { path: "auth", router: authRouter },
      { path: "cart", router: cartRouter },
      { path: "payments", router: paymentRouter },
      { path: "products", router: productsRouter },
    ],
  });

  return { app, config: parsed, logger, redis };
}
