export * from "./webhooks.js";

import { LoggerPort } from "@shop/logger";
import {
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableError,
} from "@shop/types";

import type { PaymentItem } from "../database/models/index.js";
import {
  CartsPort,
  PaymentProviderPort,
  Products,
  ProductsPort,
  PaymentsRepoPort,
} from "../infrastructure/ports/index.js";

export type CartItem = {
  name: string;
  price: string;
  currency: string;
  quantity: number;
  productId: number;
};

const PAYMENT_PAGE_SIZE = 20;

export class PaymentsService {
  constructor(
    private readonly paymentRepo: PaymentsRepoPort,
    private readonly logger: LoggerPort,
    private readonly productsService: ProductsPort,
    private readonly cartsService: CartsPort,
    private readonly provider: PaymentProviderPort,
  ) {}

  // implemented like this to show how tracing can help spot n+1 situatins
  private async priceCart(items: Products[]): Promise<{
    amount: string;
    currency: string;
    items: PaymentItem[];
  }> {
    const priced = await Promise.all(
      items.map(async (item) => {
        const found = await this.productsService.findOne(item.productId);

        if (!found.success) {
          this.logger.error("Failed to price a cart item", found.error);

          throw new ServiceUnavailableError("Could not price the cart");
        }

        if (!found.data) {
          throw new UnprocessableError(
            `Product ${item.productId} is no longer available`,
          );
        }

        return {
          productId: found.data.id,
          name: found.data.name,
          price: found.data.price,
          currency: found.data.currency,
          quantity: item.quantity,
        };
      }),
    );

    const currencies = new Set(priced.map((line) => line.currency));

    if (currencies.size > 1) {
      throw new UnprocessableError(
        `Cannot check out a cart with mixed currencies: ${[...currencies]
          .sort()
          .join(", ")}`,
      );
    }

    const amount = priced.reduce(
      (total, line) => total + BigInt(line.price) * BigInt(line.quantity),
      0n,
    );

    return {
      amount: amount.toString(),
      currency: priced[0].currency,
      items: priced,
    };
  }

  async checkout(userId: string, idempotencyKey: string) {
    // check if the payment has been initiated before
    const existing = await this.paymentRepo.findByIdempotencyKey(
      userId,
      idempotencyKey,
    );

    if (existing) {
      return {
        id: existing.id,
        status: existing.status,
        amount: existing.amount,
        currency: existing.currency,
      };
    }

    // get the items in the users cart
    const items = await this.cartsService.findOneByUserId(userId);

    if (!items.success) {
      this.logger.error("Failed to get cart items", items.error);

      throw new ServiceUnavailableError();
    }

    if (!items.data.length) {
      throw new NotFoundError("Cart is empty");
    }

    // get the actual pricing of each item in the users cart
    const updatedPricing = await this.priceCart(items.data);

    const reserveList = items.data.map((item) => {
      return { id: item.productId, qty: item.quantity };
    });

    // reserve the items for the user
    const reserved = await this.productsService.reserve(
      reserveList,
      idempotencyKey,
    );

    if (!reserved.success) {
      if (
        reserved.error instanceof UnprocessableError ||
        reserved.error instanceof NotFoundError
      ) {
        this.logger.debug("Failed to reserve products", reserved.error);

        throw reserved.error;
      }

      this.logger.error("Failed to reserve products", reserved.error);

      throw new ServiceUnavailableError();
    }

    // record the payment (its pending atp)
    const paymentRecorded = await this.paymentRepo.create({
      userId,
      idempotencyKey,
      items: updatedPricing.items,
      amount: updatedPricing.amount,
      currency: updatedPricing.currency,
    });

    // initiate payment
    const accepted = await this.provider.pay({
      paymentId: paymentRecorded.id,
      amount: paymentRecorded.amount,
      currency: paymentRecorded.currency,
      idempotencyKey,
    });

    if (!accepted.success) {
      this.logger.error("Provider rejected the charge", accepted.error);

      const released = await this.productsService.release(idempotencyKey);

      if (!released.success) {
        this.logger.error("Failed to release reserved stock", released.error);
      }

      await this.paymentRepo.markStatus(paymentRecorded.id, "failed", null);

      throw new ServiceUnavailableError("Could not take the payment");
    }

    // add the payment reference to the payment record
    await this.paymentRepo.attachProviderReference(
      paymentRecorded.id,
      accepted.data.providerReference,
    );

    return {
      id: paymentRecorded.id,
      status: paymentRecorded.status,
      amount: paymentRecorded.amount,
      currency: paymentRecorded.currency,
    };
  }

  async getPayments(userId: string, cursor?: string) {
    const rows = await this.paymentRepo.findManyByUserId(
      userId,
      PAYMENT_PAGE_SIZE + 1,
      cursor,
    );

    const hasNextPage = rows.length > PAYMENT_PAGE_SIZE;

    const payments = rows.slice(0, PAYMENT_PAGE_SIZE);

    return {
      hasNextPage,
      payments,
      cursor: hasNextPage ? payments[payments.length - 1]?.id : undefined,
    };
  }
}
