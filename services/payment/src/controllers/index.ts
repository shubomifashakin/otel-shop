export * from "./webhooks.js";

import { RequestHandler } from "express";
import { z } from "zod";

import { BadRequestError, UnauthorizedError } from "@shop/types";

import { PaymentsService } from "../services/index.js";
import {
  paymentsQueryValidator,
} from "../validators/index.js";
import { toDetails } from "./to-details.js";

export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  getPayments: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const query = paymentsQueryValidator.safeParse(req.query);

    if (!query.success) {
      throw new BadRequestError("Invalid query", toDetails(query.error));
    }

    const items = await this.paymentsService.getPayments(
      userId,
      query.data.cursor,
    );

    res.status(200).json(items);
  };

  checkout: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    const idempotencyKey = z
      .string()
      .nonempty()
      .safeParse(req.headers["x-idempotency-key"]);

    if (!idempotencyKey.success) {
      throw new BadRequestError("Invalid idempotency key");
    }

    if (!userId) {
      throw new UnauthorizedError();
    }

    const payment = await this.paymentsService.checkout(
      userId,
      idempotencyKey.data,
    );

    res.status(202).json(payment);
  };
}
