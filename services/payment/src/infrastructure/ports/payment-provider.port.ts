import { AdapterResponse } from "@shop/types";

export type PaymentIntent = {
  paymentId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
};

export type AcceptedPayment = {
  providerReference: string;
};

export interface PaymentProviderPort {
  pay(intent: PaymentIntent): Promise<AdapterResponse<AcceptedPayment>>;
}
