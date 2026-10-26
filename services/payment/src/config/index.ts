import { z } from "zod";

import dotenv from "dotenv";

dotenv.config();

const config = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REDIS_URL: z.url(),
  LOG_LEVEL: z.enum(["info", "debug", "warn", "error"]).default("info"),
  SERVICE_NAME: z.string().nonempty(),
  JWT_ISSUER: z.string().nonempty(),
  JWT_AUDIENCE: z.string().nonempty(),
  DATABASE_URL: z.url(),
  AUTH_JWKS_URL: z.url(),
  PRODUCTS_SERVICE_URL: z.url(),
  CART_SERVICE_URL: z.url(),
  INTERNAL_API_TOKEN: z.string().min(16),
  PAYMENT_PROVIDER_URL: z.url(),
  PAYMENT_CALLBACK_URL: z.url(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  KAFKA_BROKERS: z.string().nonempty(),
});

export const parsed = config.parse(process.env);
