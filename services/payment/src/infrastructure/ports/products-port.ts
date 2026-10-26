import { AdapterResponse } from "@shop/types";

export type ProductInfo = {
  id: number;
  name: string;
  price: string;
  currency: string;
  quantity: number;
};

export type ReserveItems = {
  id: number;
  qty: number;
};

export interface ProductsPort {
  findOne(id: number): Promise<AdapterResponse<ProductInfo | null>>;

  reserve(
    items: ReserveItems[],
    idempotencyKey: string,
  ): Promise<AdapterResponse<void>>;

  release(idempotencyKey: string): Promise<AdapterResponse<void>>;
}
