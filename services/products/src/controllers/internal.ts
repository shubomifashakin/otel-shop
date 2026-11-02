import { RequestHandler } from "express";
import z from "zod";

import { BadRequestError } from "@shop/types";

import { StockRepoPort } from "../infrastructure/ports/index.js";
import { stockMutationValidator } from "../validators/index.js";

const idempotencyKeyHeader = z.string().nonempty().max(255);

export class InternalStockController {
  constructor(private readonly stock: StockRepoPort) {}

  reserve: RequestHandler = async (req, res) => {
    const parsed = idempotencyKeyHeader.safeParse(
      req.headers["x-idempotency-key"],
    );

    if (!parsed.success) {
      throw new BadRequestError("Invalid idempotency key");
    }

    const body = stockMutationValidator.safeParse(req.body);

    if (!body.success) {
      throw new BadRequestError("Invalid request body");
    }

    await this.stock.reserve(body.data.items, parsed.data);

    res.status(200).json({ reserved: true });
  };

  release: RequestHandler = async (req, res) => {
    const parsed = idempotencyKeyHeader.safeParse(
      req.headers["x-idempotency-key"],
    );

    if (!parsed.success) {
      throw new BadRequestError("Invalid idempotency key");
    }

    await this.stock.release(parsed.data);

    res.status(200).json({ released: true });
  };
}
