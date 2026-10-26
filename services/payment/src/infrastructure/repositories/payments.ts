import { Op, UniqueConstraintError } from "sequelize";

import { ConflictError } from "@shop/types";

import { Payments, type PaymentStatus } from "../../database/models/index.js";
import {
  CreatePaymentInput,
  Payment,
  PaymentsRepoPort,
} from "../ports/index.js";

function toPayment(model: Payments): Payment {
  return {
    id: model.id,
    userId: model.userId,
    status: model.status,
    amount: model.amount,
    currency: model.currency,
    idempotencyKey: model.idempotencyKey,
    providerReference: model.providerReference,
    items: model.items,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export class PaymentsRepository implements PaymentsRepoPort {
  constructor(private readonly payments: typeof Payments) {}

  async create(input: CreatePaymentInput): Promise<Payment> {
    try {
      const created = await this.payments.create(input);

      return toPayment(created);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConflictError("This payment has already been submitted");
      }

      throw err;
    }
  }

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Payment | null> {
    const found = await this.payments.findOne({
      where: { userId, idempotencyKey },
    });

    return found ? toPayment(found) : null;
  }

  async attachProviderReference(
    id: string,
    providerReference: string,
  ): Promise<void> {
    await this.payments.update(
      { providerReference },
      { where: { id, status: "pending" } },
    );
  }

  async markStatus(
    id: string,
    status: PaymentStatus,
    providerReference: string | null,
  ): Promise<Payment | null> {
    const [, updated] = await this.payments.update(
      { status, providerReference },
      { where: { id, status: "pending" }, returning: true },
    );

    return updated[0] ? toPayment(updated[0]) : null;
  }

  async findManyByUserId(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Payment[]> {
    const after = cursor
      ? await this.payments.findOne({
          where: { userId, id: cursor },
          attributes: ["id", "createdAt"],
        })
      : null;

    if (cursor && !after) {
      return [];
    }

    const found = await this.payments.findAll({
      where: {
        userId,
        ...(after && {
          [Op.or]: [
            { createdAt: { [Op.lt]: after.createdAt } },
            { createdAt: after.createdAt, id: { [Op.lt]: after.id } },
          ],
        }),
      },
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit,
    });

    return found.map(toPayment);
  }
}
