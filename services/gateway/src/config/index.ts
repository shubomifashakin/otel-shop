import { z } from "zod";

import dotenv from "dotenv";

dotenv.config();

const config = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REDIS_URL: z.url(),
  LOG_LEVEL: z.enum(["info", "debug", "warn", "error"]).default("info"),
  SERVICE_NAME: z.string().nonempty(),
  AUTH_SERVICE_URL: z.url(),
  CART_SERVICE_URL: z.url(),
  INVENTORY_SERVICE_URL: z.url(),
  PAYMENT_SERVICE_URL: z.url(),
  AUTH_JWKS_URL: z.url(),
  JWT_ISSUER: z.string().nonempty(),
  JWT_AUDIENCE: z.string().nonempty(),
});

export const parsed = config.parse(process.env);
