import { createApp } from "./app.js";
import { parsed } from "./config/index.js";
import { createLogger } from "@shop/logger";
import {
  createRedis,
  createSequelizeConnection,
} from "./infrastructure/clients/index.js";
import {
  Argon2Hasher,
  JoseTokenSigner,
  RedisCacheAdapter,
} from "./infrastructure/adapters/index.js";
import { AuthService } from "./services/index.js";
import { AuthController } from "./controllers/index.js";
import { createAuthRouter, createJwksRouter } from "./routers/index.js";
import { createErrorMiddleware } from "./middlewares/index.js";
import { registerUserModel } from "./database/models/index.js";
import { UsersRepository } from "./infrastructure/repositories/index.js";

export async function bootstrap() {
  const logger = createLogger(parsed.SERVICE_NAME, parsed.LOG_LEVEL);
  const sequelize = await createSequelizeConnection(parsed.DATABASE_URL);
  const redis = await createRedis(
    parsed.REDIS_URL,
    parsed.SERVICE_NAME,
    logger,
  );

  // create the adapters
  const hasherAdapter = new Argon2Hasher();
  const redisAdapter = new RedisCacheAdapter(redis);
  const tokenSignerAdapter = await JoseTokenSigner.create({
    privateKeyBase64: parsed.JWT_PRIVATE_KEY_BASE64,
    issuer: parsed.JWT_ISSUER,
    audience: parsed.JWT_AUDIENCE,
    accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
  });

  // setup models
  const userModel = registerUserModel(sequelize);

  // FIXME: this is not ideal, only did this cus i didnt want to run migrations
  await sequelize.sync();

  //  create the repositories
  const userRepository = new UsersRepository(userModel);

  // create the middlewares
  const globalErrorMiddleware = createErrorMiddleware(logger);

  // create the services
  const authService = new AuthService(
    userRepository,
    hasherAdapter,
    logger,
    redisAdapter,
    tokenSignerAdapter,
    parsed.ACCESS_TOKEN_TTL_SECONDS,
  );

  // create the controllers
  const authController = new AuthController(authService);

  // create the routers
  const router = createAuthRouter(authController);
  const jwksRouter = createJwksRouter(tokenSignerAdapter, logger);

  const app = createApp({
    routers: [
      { path: "/.well-known", router: jwksRouter },
      { path: "/", router },
    ],
    errorMiddleware: globalErrorMiddleware,
  });

  return { app, config: parsed, logger, redis, sequelize };
}
