import { LoggerPort } from "@shop/logger";
import {
  NotFoundError,
  UnprocessableError,
  ServiceUnavailableError,
} from "@shop/types";

import {
  CachePort,
  ProductInfo,
  ProductsPort,
} from "../infrastructure/ports/index.js";
import { addToCartDto, updateCartItemDto } from "../validators/index.js";

export type CartItem = {
  name: string;
  price: string;
  currency: string;
  quantity: number;
  productId: number;
};

const cartKey = (userId: string) => `cart:${userId}`;

const CART_TTL_SECONDS = 60 * 60 * 24 * 7;

const CART_PAGE_SIZE = 20;

const MAX_DISTINCT_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 100;

export class CartService {
  constructor(
    private readonly logger: LoggerPort,
    private readonly cache: CachePort,
    private readonly products: ProductsPort,
  ) {}

  private async resolveProduct(productId: number): Promise<ProductInfo> {
    const found = await this.products.findOne(productId);

    if (!found.success) {
      this.logger.error("Failed to reach the products service", found.error);

      throw new ServiceUnavailableError("Could not verify the product");
    }

    if (!found.data) {
      throw new NotFoundError("Product does not exist");
    }

    return found.data;
  }

  private async read(userId: string): Promise<CartItem[]> {
    const stored = await this.cache.get<CartItem[]>(cartKey(userId));

    if (!stored.success) {
      this.logger.error("Failed to read the cart", stored.error);

      throw new Error("Failed to read the cart");
    }

    return stored.data ?? [];
  }

  private async write(userId: string, items: CartItem[]): Promise<void> {
    const written = await this.cache.set(
      cartKey(userId),
      JSON.stringify(items),
      CART_TTL_SECONDS,
    );

    if (!written.success) {
      this.logger.error("Failed to write the cart", written.error);

      throw new Error("Failed to write the cart");
    }
  }

  async addItem(dto: addToCartDto, userId: string) {
    const items = await this.read(userId);

    const existing = items.find((item) => item.productId === dto.productId);

    const quantity = existing ? existing.quantity + dto.quantity : dto.quantity;

    if (quantity > MAX_QUANTITY_PER_ITEM) {
      throw new UnprocessableError(
        `A cart line cannot exceed ${MAX_QUANTITY_PER_ITEM} units`,
      );
    }

    if (!existing && items.length >= MAX_DISTINCT_ITEMS) {
      throw new UnprocessableError(
        `A cart cannot hold more than ${MAX_DISTINCT_ITEMS} different products`,
      );
    }

    const product = await this.resolveProduct(dto.productId);

    if (existing) {
      existing.quantity = quantity;
      existing.name = product.name;
      existing.price = product.price;
      existing.currency = product.currency;
    } else {
      items.push({
        productId: product.id,
        quantity,
        name: product.name,
        price: product.price,
        currency: product.currency,
      });
    }

    await this.write(userId, items);
  }

  async updateItem(dto: updateCartItemDto, productId: number, userId: string) {
    const items = await this.read(userId);

    const existing = items.find((item) => item.productId === productId);

    if (!existing) {
      throw new NotFoundError("Product is not in the cart");
    }

    existing.quantity = dto.quantity;

    await this.write(userId, items);
  }

  async removeItem(productId: number, userId: string) {
    const items = await this.read(userId);

    const remaining = items.filter((item) => item.productId !== productId);

    if (remaining.length === items.length) {
      throw new NotFoundError("Product is not in the cart");
    }

    if (remaining.length === 0) {
      await this.clear(userId);

      return;
    }

    await this.write(userId, remaining);
  }

  async clear(userId: string) {
    const cleared = await this.cache.del(cartKey(userId));

    if (!cleared.success) {
      this.logger.error("Failed to clear the cart", cleared.error);

      throw new Error("Failed to clear the cart");
    }
  }

  async getAllItems(userId: string): Promise<CartItem[]> {
    return this.read(userId);
  }

  async getItems(userId: string, cursor?: number) {
    const items = await this.read(userId);

    const ordered = [...items].sort((a, b) => a.productId - b.productId);

    const after =
      cursor === undefined
        ? ordered
        : ordered.filter((item) => item.productId > cursor);

    const hasNextPage = after.length > CART_PAGE_SIZE;
    const page = after.slice(0, CART_PAGE_SIZE);

    return {
      hasNextPage,
      items: page,
      cursor: hasNextPage ? page[page.length - 1]?.productId : undefined,
      totalItems: ordered.length,
    };
  }
}
