import type { ReservedItem } from "../../database/models/index.js";

export type { ReservedItem };

export interface StockRepoPort {
  reserve(items: ReservedItem[], idempotencyKey: string): Promise<void>;

  markSold(idempotencyKey: string): Promise<void>;

  release(idempotencyKey: string): Promise<void>;

  expireStale(now?: Date): Promise<number>;
}
