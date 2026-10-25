import { z } from "zod";

import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";

import { ProductInfo, ProductsPort } from "../ports/index.js";

const productResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  price: z.string(),
  currency: z.string(),
  quantity: z.number().int(),
});

export class HttpProductsAdapter implements ProductsPort {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async findOne(id: number): Promise<AdapterResponse<ProductInfo | null>> {
    try {
      const response = await fetch(new URL(`/${id}`, this.baseUrl), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status === 404) {
        return { success: true, data: null, error: null };
      }

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: new Error(`products responded with ${response.status}`),
        };
      }

      const data = await response.json();
      const parsed = productResponseSchema.safeParse(data);

      if (!parsed.success) {
        return {
          success: false,
          data: null,
          error: new Error(
            `unexpected product payload: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".")} ${issue.message}`)
              .join("; ")}`,
          ),
        };
      }

      return { success: true, data: parsed.data, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
