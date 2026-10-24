import { createClient } from "redis";
import { LoggerPort } from "@shop/logger";

export async function createRedis(
  url: string,
  serviceName: string,
  logger: LoggerPort,
) {
  const client = createClient({
    url,
    name: serviceName,
    disableOfflineQueue: true,
    socket: {
      reconnectStrategy: (retries) =>
        retries > 10
          ? new Error("redis unreachable")
          : Math.min(retries * 100, 3000),
    },
  });

  client.on("error", (err) => {
    logger.error("Redis error", err);
  });

  client.on("ready", () => {
    logger.info("Redis ready");
  });

  await client.connect();

  return client;
}
