import { AdapterResponse } from "../../types/index.js";

export interface CachePort {
  get<T>(id: string): Promise<AdapterResponse<T | null>>;

  allow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<AdapterResponse<boolean>>;
}
