import type {
  PaymentItem,
  PaymentStatus,
} from "../../database/models/index.js";

export type Payment = {
  id: string;
  userId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  idempotencyKey: string;
  providerReference: string | null;
  items: PaymentItem[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentInput = {
  userId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  items: PaymentItem[];
};

export interface PaymentsRepoPort {
  create(input: CreatePaymentInput): Promise<Payment>;

  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Payment | null>;

  attachProviderReference(id: string, providerReference: string): Promise<void>;

  markStatus(
    id: string,
    status: PaymentStatus,
    providerReference: string | null,
  ): Promise<Payment | null>;

  findManyByUserId(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Payment[]>;
}
