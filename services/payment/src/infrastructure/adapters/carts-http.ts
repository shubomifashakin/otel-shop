import z from "zod";
import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";

import { CartsPort, Products } from "../ports/index.js";

const products = z.object({
  productId: z.int(),
  name: z.string(),
  price: z.string().regex(/^\d+$/, "price must be minor units"),
  currency: z.string(),
  quantity: z.int(),
});

const productResponseSchema = z.object({
  products: z.array(products),
});

export class HttpCartAdapter implements CartsPort {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs: number,
  ) {}

  async findOneByUserId(userId: string): Promise<AdapterResponse<Products[]>> {
    try {
      const response = await fetch(
        new URL(`/internal/cart/${userId}`, this.baseUrl),
        {
          headers: {
            accept: "application/json",
            "x-internal-token": this.internalToken,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: new Error(`carts responded with ${response.status}`),
        };
      }

      const data = await response.json();
      const parsed = productResponseSchema.safeParse(data);

      if (!parsed.success) {
        return {
          success: false,
          data: null,
          error: new Error(
            `unexpected cart payload: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".")} ${issue.message}`)
              .join("; ")}`,
          ),
        };
      }

      return { success: true, data: parsed.data.products, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
