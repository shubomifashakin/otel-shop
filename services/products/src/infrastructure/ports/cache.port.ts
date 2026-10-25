import { AdapterResponse } from "@shop/types";

export interface CachePort {
  get<T>(key: string): Promise<AdapterResponse<T | null>>;

  set<T>(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<AdapterResponse<null>>;

  allow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<AdapterResponse<boolean>>;
}
