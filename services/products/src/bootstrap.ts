import { createLogger } from "@shop/logger";
import { createInternalAuthMiddleware } from "@shop/http";

import { parsed } from "./config/index.js";
import {
  createKafka,
  createRedis,
  createSequelizeConnection,
} from "./infrastructure/clients/index.js";
import { createApp } from "./app.js";
import {
  RedisCacheAdapter,
  PaymentEventsConsumer,
} from "./infrastructure/adapters/index.js";
import { ProductsService } from "./services/index.js";
import {
  InternalStockController,
  ProductsController,
} from "./controllers/index.js";
import { createInternalRouter, createProductsRouter } from "./routers/index.js";
import { createErrorMiddleware } from "./middlewares/index.js";
import {
  registerProductsModel,
  registerStockReservationsModel,
} from "./database/models/index.js";
import {
  ProductsRepository,
  StockRepository,
} from "./infrastructure/repositories/index.js";

export async function bootstrap() {
  // setup clients
  const logger = createLogger(parsed.SERVICE_NAME, parsed.LOG_LEVEL);

  const redis = await createRedis(
    parsed.REDIS_URL,
    parsed.SERVICE_NAME,
    logger,
  );

  const sequelize = await createSequelizeConnection(parsed.DATABASE_URL);

  const productsModel = registerProductsModel(sequelize);
  const stockReservationsModel = registerStockReservationsModel(sequelize);

  // dont do this
  await sequelize.sync();

  const redisAdapter = new RedisCacheAdapter(redis);

  const productsRepo = new ProductsRepository(productsModel);

  const stockRepo = new StockRepository(
    sequelize,
    productsModel,
    stockReservationsModel,
  );

  // kafak related stuff
  const kafka = createKafka(parsed.KAFKA_BROKERS, parsed.SERVICE_NAME);

  const paymentsConsumer = kafka.consumer({
    groupId: "products-stock-consumer",
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

  const consumerInstance = await new PaymentEventsConsumer(
    paymentsConsumer,
    stockRepo,
    logger,
  ).start();

  if (!consumerInstance.success) {
    logger.error(
      "Failed to start payments events consumer",
      consumerInstance.error,
    );

    throw consumerInstance.error;
  }

  const errorMiddleware = createErrorMiddleware(logger);

  const productsService = new ProductsService(
    logger,
    redisAdapter,
    productsRepo,
  );

  const productsController = new ProductsController(productsService);

  const productsRouter = createProductsRouter(productsController);

  const internalRouter = createInternalRouter(
    new InternalStockController(stockRepo),
    createInternalAuthMiddleware(logger, parsed.INTERNAL_API_TOKEN),
  );

  const app = createApp({
    errorMiddleware,
    routers: [
      { path: "/internal", router: internalRouter },
      { path: "/", router: productsRouter },
    ],
  });

  return { app, logger, redis, config: parsed, sequelize, paymentsConsumer };
}
