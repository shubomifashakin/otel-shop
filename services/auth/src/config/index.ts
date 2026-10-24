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
  JWT_PRIVATE_KEY_BASE64: z.base64(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
});

export const parsed = config.parse(process.env);
