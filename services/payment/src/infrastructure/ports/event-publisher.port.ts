import { AdapterResponse } from "@shop/types";
import type { PaymentOutcomeEvent, PaymentTopic } from "@shop/events";

export interface EventPublisherPort {
  publish(
    topic: PaymentTopic,
    event: PaymentOutcomeEvent,
  ): Promise<AdapterResponse<void>>;
}
