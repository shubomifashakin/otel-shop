export const PAYMENT_TOPICS = {
  succeeded: "payment.succeeded",
  failed: "payment.failed",
} as const;

export type PaymentTopic = (typeof PAYMENT_TOPICS)[keyof typeof PAYMENT_TOPICS];

export type PaymentEventItem = {
  productId: number;
  name: string;
  price: string;
  currency: string;
  quantity: number;
};

export type PaymentOutcomeEvent = {
  eventId: string;
  occurredAt: string;
  paymentId: string;
  userId: string;
  idempotencyKey: string;
  status: "succeeded" | "failed";
  amount: string;
  currency: string;
  providerReference: string | null;
  items: PaymentEventItem[];
};
