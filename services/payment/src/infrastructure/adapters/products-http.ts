import { z } from "zod";

import { makeError } from "@shop/utils";
import {
  AdapterResponse,
  NotFoundError,
  UnprocessableError,
} from "@shop/types";

import { ProductInfo, ProductsPort, ReserveItems } from "../ports/index.js";

const productResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  price: z.string().regex(/^\d+$/, "price must be minor units"),
  currency: z.string(),
  quantity: z.number().int(),
});

export class HttpProductsAdapter implements ProductsPort {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
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

  async release(idempotencyKey: string): Promise<AdapterResponse<void>> {
    try {
      const response = await fetch(
        new URL(`/internal/stock/release`, this.baseUrl),
        {
          headers: {
            accept: "application/json",
            "x-idempotency-key": idempotencyKey,
            "x-internal-token": this.internalToken,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
          method: "POST",
        },
      );

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: new Error(`products responded with ${response.status}`),
        };
      }

      return { success: true, data: undefined, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }

  async reserve(
    items: ReserveItems[],
    idempotencyKey: string,
  ): Promise<AdapterResponse<void>> {
    try {
      const response = await fetch(
        new URL(`/internal/stock/reserve`, this.baseUrl),
        {
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-idempotency-key": idempotencyKey,
            "x-internal-token": this.internalToken,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
          method: "POST",
          body: JSON.stringify({ items }),
        },
      );

      if (response.status === 404) {
        return {
          success: false,
          data: null,
          error: new NotFoundError("Product does not exist"),
        };
      }

      if (response.status === 422) {
        return {
          success: false,
          data: null,
          error: new UnprocessableError("Product is out of stock"),
        };
      }

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: new Error(`products responded with ${response.status}`),
        };
      }

      return { success: true, data: undefined, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
