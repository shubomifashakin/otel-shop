import { Consumer, EachMessagePayload, KafkaMessage } from "kafkajs";

import { makeError } from "@shop/utils";
import { LoggerPort } from "@shop/logger";
import { AdapterResponse } from "@shop/types";
import { PAYMENT_TOPICS } from "@shop/events";

import { EventConsumerPort, StockRepoPort } from "../ports/index.js";
import {
  paymentOutcomeEventDto,
  paymentOutcomeEventValidator,
} from "../../validators/index.js";

export class PaymentEventsConsumer implements EventConsumerPort {
  constructor(
    private readonly client: Consumer,
    private readonly stockRepo: StockRepoPort,
    private readonly logger: LoggerPort,
  ) {}

  async start(): Promise<AdapterResponse<void>> {
    try {
      await this.client.connect();
      await this.client.subscribe({
        fromBeginning: true,
        topics: [PAYMENT_TOPICS.succeeded, PAYMENT_TOPICS.failed],
      });

      await this.client.run({
        eachMessage: (payload) => this.handleMessage(payload),
      });

      return { success: true, error: null, data: undefined };
    } catch (err) {
      return { data: null, error: makeError(err), success: false };
    }
  }

  private async handleMessage({
    topic,
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    const context = { topic, partition, offset: message.offset };

    const event = this.parseEvent(message, context);

    if (!event) {
      return;
    }

    switch (topic) {
      case PAYMENT_TOPICS.succeeded:
        await this.stockRepo.markSold(event.idempotencyKey);

        this.logger.info("Settled a stock reservation", {
          ...context,
          eventId: event.eventId,
          paymentId: event.paymentId,
        });

        return;

      case PAYMENT_TOPICS.failed:
        await this.stockRepo.release(event.idempotencyKey);

        this.logger.info("Released a stock reservation", {
          ...context,
          eventId: event.eventId,
          paymentId: event.paymentId,
        });

        return;

      default:
        this.logger.error("Received a message on an unhandled topic", context);

        return;
    }
  }

  private parseEvent(
    message: KafkaMessage,
    context: Record<string, unknown>,
  ): paymentOutcomeEventDto | null {
    if (!message.value) {
      this.logger.error("Received a message with no value", context);

      return null;
    }

    let payload: unknown;

    try {
      payload = JSON.parse(message.value.toString("utf8"));
    } catch {
      this.logger.error("Received a message that is not json", context);

      return null;
    }

    const parsed = paymentOutcomeEventValidator.safeParse(payload);

    if (!parsed.success) {
      this.logger.error("Received a message that does not match the event", {
        ...context,
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join(".")} ${issue.message}`,
        ),
      });

      return null;
    }

    return parsed.data;
  }
}
