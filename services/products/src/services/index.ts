import { LoggerPort } from "@shop/logger";
import { NotFoundError } from "@shop/types";

import {
  CachePort,
  ProductInfo,
  ProductsRepoPort,
} from "../infrastructure/ports/index.js";

const PRODUCT_LIMIT = 20;

export class ProductsService {
  constructor(
    private readonly logger: LoggerPort,
    private readonly cache: CachePort,
    private readonly productsRepo: ProductsRepoPort,
  ) {}

  async getMany(cursor?: number) {
    const rows = await this.productsRepo.findMany(PRODUCT_LIMIT + 1, cursor);

    const hasNextPage = rows.length > PRODUCT_LIMIT;
    const products = rows.slice(0, PRODUCT_LIMIT);

    return {
      hasNextPage,
      products,
      cursor: hasNextPage ? products[products.length - 1]?.id : undefined,
    };
  }

  async getOne(id: number) {
    const cacheKey = `product:${id}`;
    const exists = await this.cache.get<ProductInfo>(cacheKey);

    if (!exists.success) {
      this.logger.error("Failed to get product from cache", exists.error);
    }

    if (exists.success && exists.data) {
      return exists.data;
    }

    // get from the database
    const product = await this.productsRepo.findOne(id);

    if (!product) {
      throw new NotFoundError("Product does not exist");
    }

    const cached = await this.cache.set(
      cacheKey,
      JSON.stringify(product),
      60 * 5,
    );

    if (!cached.success) {
      this.logger.error("Failed to cache product", cached.error);
    }

    return product;
  }
}
