import { AdapterResponse } from "@shop/types";

export type ProductInfo = {
  id: number;
  name: string;
  price: string;
  currency: string;
  quantity: number;
};

export interface ProductsPort {
  findOne(id: number): Promise<AdapterResponse<ProductInfo | null>>;
}
