import { Producer } from "kafkajs";
import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";
import { PaymentTopic, PaymentOutcomeEvent } from "@shop/events";

import { EventPublisherPort } from "../ports/index.js";

export class KafkaEventPublisher implements EventPublisherPort {
  constructor(private readonly client: Producer) {}

  async publish(
    topic: PaymentTopic,
    event: PaymentOutcomeEvent,
  ): Promise<AdapterResponse<void>> {
    try {
      await this.client.send({
        topic,
        timeout: 5 * 1000,
        messages: [
          {
            key: event.userId, // the partition key, so a users event always stays in the same partition and is always ordered
            value: JSON.stringify(event),
            timestamp: Date.now().toString(),
          },
        ],
      });

      return { success: true, data: undefined, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
