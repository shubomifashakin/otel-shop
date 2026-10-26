import { RequestHandler } from "express";

import { BadRequestError } from "@shop/types";

import { WebhooksService } from "../services/index.js";
import { providerWebhookValidator } from "../validators/index.js";
import { toDetails } from "./to-details.js";

export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  providerWebhook: RequestHandler = async (req, res) => {
    const body = providerWebhookValidator.safeParse(req.body);

    if (!body.success) {
      throw new BadRequestError("Invalid webhook body", toDetails(body.error));
    }

    const result = await this.webhooksService.applyProviderOutcome(
      body.data.paymentId,
      body.data.outcome,
      body.data.reference,
    );

    res.status(200).json(result);
  };
}
