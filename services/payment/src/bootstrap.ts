import { createLogger } from "@shop/logger";
import { createTokenVerifier } from "@shop/jwt";

import { parsed } from "./config/index.js";
import {
  createKafka,
  createRedis,
  createSequelizeConnection,
} from "./infrastructure/clients/index.js";
import { createApp } from "./app.js";
import { PaymentsService, WebhooksService } from "./services/index.js";
import { PaymentsController, WebhooksController } from "./controllers/index.js";
import { createPaymentsRouter, createWebhooksRouter } from "./routers/index.js";
import {
  createAuthMiddleware,
  createErrorMiddleware,
  createWebhookSignatureMiddleware,
} from "./middlewares/index.js";
import {
  HttpCartAdapter,
  RedisCacheAdapter,
  HttpProductsAdapter,
  KafkaEventPublisher,
  HttpPaymentProviderAdapter,
} from "./infrastructure/adapters/index.js";
import { PaymentsRepository } from "./infrastructure/repositories/index.js";
import { registerPaymentsModel } from "./database/models/index.js";

export async function bootstrap() {
  const logger = createLogger(parsed.SERVICE_NAME, parsed.LOG_LEVEL);

  const sequelize = await createSequelizeConnection(parsed.DATABASE_URL);
  const redis = await createRedis(
    parsed.REDIS_URL,
    parsed.SERVICE_NAME,
    logger,
  );
  const kafka = createKafka(parsed.KAFKA_BROKERS, parsed.SERVICE_NAME);

  const paymentModel = registerPaymentsModel(sequelize);

  const paymentRepo = new PaymentsRepository(paymentModel);

  // not ideall
  await sequelize.sync();

  const redisAdapter = new RedisCacheAdapter(redis);

  const kafkaProducer = kafka.producer({
    idempotent: true,
    allowAutoTopicCreation: false,
    retry: {
      retries: 2,
      initialRetryTime: 300,
      maxRetryTime: 5 * 1000,
    },
  });

  await kafkaProducer.connect();

  const eventProducer = new KafkaEventPublisher(kafkaProducer);

  const productsAdapter = new HttpProductsAdapter(
    parsed.PRODUCTS_SERVICE_URL,
    parsed.INTERNAL_API_TOKEN,
    3 * 1000,
  );
  const cartsAdapter = new HttpCartAdapter(
    parsed.CART_SERVICE_URL,
    parsed.INTERNAL_API_TOKEN,
    3 * 1000,
  );

  const providerAdapter = new HttpPaymentProviderAdapter(
    parsed.PAYMENT_PROVIDER_URL,
    parsed.PAYMENT_CALLBACK_URL,
    10 * 1000,
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

  const webhookSignatureMiddleware = createWebhookSignatureMiddleware(
    logger,
    parsed.PAYMENT_WEBHOOK_SECRET,
  );

  const paymentsService = new PaymentsService(
    paymentRepo,
    logger,
    productsAdapter,
    cartsAdapter,
    providerAdapter,
  );

  const paymentsController = new PaymentsController(paymentsService);

  const paymentsRouter = createPaymentsRouter(
    paymentsController,
    authMiddleware,
  );

  const webhooksService = new WebhooksService(
    paymentRepo,
    logger,
    eventProducer,
  );

  const webhooksController = new WebhooksController(webhooksService);

  const webhooksRouter = createWebhooksRouter(
    webhooksController,
    webhookSignatureMiddleware,
  );

  const app = createApp({
    errorMiddleware,
    routers: [
      { path: "/webhooks", router: webhooksRouter },
      { path: "/", router: paymentsRouter },
    ],
  });

  return { app, logger, redis, config: parsed, sequelize, kafkaProducer };
}
