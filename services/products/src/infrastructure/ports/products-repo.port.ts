export type ProductInfo = {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface ProductsRepoPort {
  findOne(id: number): Promise<ProductInfo | null>;

  findMany(limit: number, cursor?: number): Promise<ProductInfo[]>;
}
