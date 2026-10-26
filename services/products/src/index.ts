import { bootstrap } from "./bootstrap.js";
import { makeError } from "@shop/utils";

const { app, config, logger, redis, sequelize, paymentsConsumer } =
  await bootstrap();

const server = app.listen(config.PORT, () => {
  logger.info(`Listening on port ${config.PORT}`);
});

const SHUTDOWN_TIMEOUT_MS = 10 * 1000;

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info("Shutting down", { signal });

  server.closeIdleConnections();

  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit", { signal });

    server.closeAllConnections();
    redis.destroy();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExit.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    await paymentsConsumer.disconnect();
    await sequelize.close();
    await redis.close();

    clearTimeout(forceExit);

    logger.info("Shutdown completed gracefully", { signal });

    process.exit(0);
  } catch (err) {
    clearTimeout(forceExit);
    logger.error("Shutdown failed", makeError(err));
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
