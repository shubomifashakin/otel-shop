import { createLogger } from "@shop/logger";
import { parsed } from "./config/index.js";
import {
  createRedis,
  createSequelizeConnection,
} from "./infrastructure/clients/index.js";
import { createApp } from "./app.js";
import { RedisCacheAdapter } from "./infrastructure/adapters/index.js";
import { ProductsService } from "./services/index.js";
import { ProductsController } from "./controllers/index.js";
import { createProductsRouter } from "./routers/index.js";
import { createErrorMiddleware } from "./middlewares/index.js";
import { registerProductsModel } from "./database/models/index.js";
import { ProductsRepository } from "./infrastructure/repositories/products.js";

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

  // dont do this
  await sequelize.sync();

  const redisAdapter = new RedisCacheAdapter(redis);

  const productsRepo = new ProductsRepository(productsModel);

  const errorMiddleware = createErrorMiddleware(logger);

  const productsService = new ProductsService(
    logger,
    redisAdapter,
    productsRepo,
  );

  const productsController = new ProductsController(productsService);

  const productsRouter = createProductsRouter(productsController);

  const app = createApp({
    errorMiddleware,
    routers: [{ path: "/", router: productsRouter }],
  });

  return { app, logger, redis, config: parsed, sequelize };
}
