import {
  Op,
  literal,
  Sequelize,
  InferAttributes,
  UniqueConstraintError,
} from "sequelize";

import { NotFoundError, UnprocessableError } from "@shop/types";

import { ReservedItem, StockRepoPort } from "../ports/index.js";
import { Products, StockReservations } from "../../database/models/index.js";

// how long a product can stay reserved for
const RESERVATION_TTL_MS = 30 * 60 * 1000;

const EXPIRY_BATCH_SIZE = 100;

export class StockRepository implements StockRepoPort {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly products: typeof Products,
    private readonly reservations: typeof StockReservations,
  ) {}

  async reserve(items: ReservedItem[], idempotencyKey: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      try {
        await this.reservations.create(
          {
            idempotencyKey,
            items,
            status: "reserved",
            expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
          },
          { transaction },
        );
      } catch (err) {
        // if the idempotency key already exists
        if (err instanceof UniqueConstraintError) {
          return;
        }

        throw err;
      }

      for (const item of items) {
        // only reserve the stock if the quantity of this is >= the requested quantity
        // if multiple requests come in at the same time and the stock is low, only 1 would succeed
        const [affected] = await this.products.update(
          {
            quantity: literal(`quantity - ${Number(item.qty)}`),
          } as unknown as Partial<InferAttributes<Products>>,
          {
            where: { id: item.id, quantity: { [Op.gte]: item.qty } },
            transaction,
          },
        );

        // if no product was updated then either the product does not exist
        // or the amount of item in stock is less than the quanty to be reserved
        if (affected === 0) {
          const product = await this.products.findByPk(item.id, {
            transaction,
          });

          if (!product) {
            throw new NotFoundError(`Product ${item.id} does not exist`);
          }

          throw new UnprocessableError(
            `Product ${item.id} has only ${product.quantity} left`,
          );
        }
      }
    });
  }

  async markSold(idempotencyKey: string): Promise<void> {
    await this.reservations.update(
      { status: "sold" },
      { where: { idempotencyKey, status: "reserved" } },
    );
  }

  async release(idempotencyKey: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      const reservation = await this.reservations.findOne({
        where: { idempotencyKey, status: "reserved" },
        transaction,
      });

      if (!reservation) {
        return;
      }

      // returns the stock reserved
      for (const item of reservation.items) {
        await this.products.update(
          {
            quantity: literal(`quantity + ${Number(item.qty)}`),
          } as unknown as Partial<InferAttributes<Products>>,
          { where: { id: item.id }, transaction },
        );
      }

      reservation.status = "released";

      await reservation.save({ transaction });
    });
  }

  // hands back stock for reservations that were never resolved
  async expireStale(now = new Date()): Promise<number> {
    const stale = await this.reservations.findAll({
      where: { status: "reserved", expiresAt: { [Op.lt]: now } },
      limit: EXPIRY_BATCH_SIZE,
      order: [["expiresAt", "ASC"]],
    });

    let expired = 0;

    for (const reservation of stale) {
      await this.sequelize.transaction(async (transaction) => {
        const [claimed] = await this.reservations.update(
          { status: "expired" },
          {
            where: { id: reservation.id, status: "reserved" },
            transaction,
          },
        );

        if (claimed === 0) {
          return;
        }

        for (const item of reservation.items) {
          await this.products.update(
            {
              quantity: literal(`quantity + ${Number(item.qty)}`),
            } as unknown as Partial<InferAttributes<Products>>,
            { where: { id: item.id }, transaction },
          );
        }

        expired += 1;
      });
    }

    return expired;
  }
}
