import { RedisClientType } from "redis";

import { CachePort } from "../ports/index.js";
import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";

export class RedisCacheAdapter implements CachePort {
  constructor(private readonly client: RedisClientType) {}

  async get<T>(key: string): Promise<AdapterResponse<T | null>> {
    try {
      const val = await this.client.get(key);

      if (!val) {
        return { success: true, data: null, error: null };
      }

      return { success: true, data: JSON.parse(val), error: null };
    } catch (err) {
      return { success: false, error: makeError(err), data: null };
    }
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<AdapterResponse<null>> {
    try {
      await this.client.set(key, value, {
        ...(ttlSeconds !== undefined && {
          expiration: { type: "EX", value: ttlSeconds },
        }),
      });

      return { success: true, data: null, error: null };
    } catch (err) {
      return { success: false, error: makeError(err), data: null };
    }
  }

  // uses fixed window algorithm
  async allow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<AdapterResponse<boolean>> {
    try {
      const [count] = await this.client
        .multi()
        .incr(key)
        .pExpire(key, windowMs, "NX")
        .exec();

      return { success: true, data: Number(count) <= limit, error: null };
    } catch (err) {
      return { success: false, error: makeError(err), data: null };
    }
  }
}
