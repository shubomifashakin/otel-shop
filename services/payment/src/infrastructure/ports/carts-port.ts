import { AdapterResponse } from "@shop/types";

export type Products = {
  productId: number;
  name: string;
  price: string;
  currency: string;
  quantity: number;
};

export interface CartsPort {
  findOneByUserId(userId: string): Promise<AdapterResponse<Products[]>>;
}
