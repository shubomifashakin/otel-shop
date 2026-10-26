import { createLogger } from "@shop/logger";
import { createInternalAuthMiddleware } from "@shop/http";
import { createTokenVerifier } from "@shop/jwt";

import { parsed } from "./config/index.js";
import { createKafka, createRedis } from "./infrastructure/clients/index.js";
import { createApp } from "./app.js";
import { CartService } from "./services/index.js";
import { CartController, InternalCartController } from "./controllers/index.js";
import { createCartRouter, createInternalRouter } from "./routers/index.js";
import {
  createAuthMiddleware,
  createErrorMiddleware,
} from "./middlewares/index.js";
import {
  RedisCacheAdapter,
  HttpProductsAdapter,
  PaymentEventsConsumer,
} from "./infrastructure/adapters/index.js";

export async function bootstrap() {
  const logger = createLogger(parsed.SERVICE_NAME, parsed.LOG_LEVEL);

  const redis = await createRedis(
    parsed.REDIS_URL,
    parsed.SERVICE_NAME,
    logger,
  );

  const redisAdapter = new RedisCacheAdapter(redis);

  const kafka = createKafka(parsed.KAFKA_BROKERS, parsed.SERVICE_NAME);

  const paymentsConsumer = kafka.consumer({
    groupId: "carts-consumer",
    allowAutoTopicCreation: false,
    retry: {
      retries: 2,
      initialRetryTime: 300,
      maxRetryTime: 5 * 1000,
    },
  });

  paymentsConsumer.on("consumer.crash", ({ payload }) => {
    logger.error("Consumer crashed", payload.error);
    logger.warn("Consumer crash details", { restarting: payload.restart });

    if (!payload.restart) process.exit(1);
  });

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

  const consumerInstance = await new PaymentEventsConsumer(
    paymentsConsumer,
    logger,
    cartService,
  ).start();

  if (!consumerInstance.success) {
    logger.error(
      "Failed to start payments events consumer",
      consumerInstance.error,
    );

    throw consumerInstance.error;
  }

  const cartController = new CartController(cartService);

  const cartsRouter = createCartRouter(cartController, authMiddleware);

  const internalRouter = createInternalRouter(
    new InternalCartController(cartService),
    createInternalAuthMiddleware(logger, parsed.INTERNAL_API_TOKEN),
  );

  const app = createApp({
    errorMiddleware,
    routers: [
      { path: "/internal", router: internalRouter },
      { path: "/", router: cartsRouter },
    ],
  });

  return { app, logger, redis, config: parsed, paymentsConsumer };
}
