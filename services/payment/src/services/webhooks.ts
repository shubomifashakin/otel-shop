import { randomUUID } from "node:crypto";
import { LoggerPort } from "@shop/logger";
import { PAYMENT_TOPICS } from "@shop/events";

import {
  PaymentsRepoPort,
  EventPublisherPort,
} from "../infrastructure/ports/index.js";

export class WebhooksService {
  constructor(
    private readonly paymentRepo: PaymentsRepoPort,
    private readonly logger: LoggerPort,
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  // NOTE: in actual systems, youd usually use transaction outbox pattern or something like thathere
  // was too lazy to set that up, sorry guys
  async applyProviderOutcome(
    paymentId: string,
    outcome: "succeeded" | "failed",
    providerReference: string | null,
  ) {
    const resolved = await this.paymentRepo.markStatus(
      paymentId,
      outcome,
      providerReference,
    );

    if (!resolved) {
      this.logger.warn("Ignored a callback for a payment that is not pending", {
        paymentId,
        outcome,
      });

      return { message: "success" };
    }

    if (outcome === "succeeded") {
      const res = await this.eventPublisher.publish(PAYMENT_TOPICS.succeeded, {
        paymentId,
        status: "succeeded",
        eventId: randomUUID(),
        items: resolved.items,
        amount: resolved.amount,
        userId: resolved.userId,
        currency: resolved.currency,
        idempotencyKey: resolved.idempotencyKey,
        occurredAt: resolved.updatedAt.toISOString(),
        providerReference: resolved.providerReference,
      });

      if (!res.success) {
        this.logger.error("Failed to send payment success event", res.error);
      }

      return { message: "success" };
    }

    const res = await this.eventPublisher.publish(PAYMENT_TOPICS.failed, {
      paymentId,
      status: "failed",
      eventId: randomUUID(),
      items: resolved.items,
      amount: resolved.amount,
      userId: resolved.userId,
      currency: resolved.currency,
      idempotencyKey: resolved.idempotencyKey,
      occurredAt: resolved.updatedAt.toISOString(),
      providerReference: resolved.providerReference,
    });

    if (!res.success) {
      this.logger.error("Failed to send payment failed event", res.error);
    }

    return { message: "success" };
  }
}
