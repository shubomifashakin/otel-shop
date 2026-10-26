import {
  Model,
  DataTypes,
  Sequelize,
  InferAttributes,
  CreationOptional,
  InferCreationAttributes,
} from "sequelize";

export type PaymentStatus = "pending" | "succeeded" | "failed";

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "pending",
  "succeeded",
  "failed",
];

export type PaymentItem = {
  productId: number;
  name: string;
  price: string;
  currency: string;
  quantity: number;
};

export class Payments extends Model<
  InferAttributes<Payments>,
  InferCreationAttributes<Payments>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare status: CreationOptional<PaymentStatus>;
  declare amount: string;
  declare currency: string;
  declare idempotencyKey: string;
  declare providerReference: CreationOptional<string | null>;
  declare items: PaymentItem[];

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function registerPaymentsModel(sequelize: Sequelize) {
  Payments.init(
    {
      id: {
        primaryKey: true,
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...PAYMENT_STATUSES),
        allowNull: false,
        defaultValue: "pending",
      },
      amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
      },
      idempotencyKey: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      providerReference: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      items: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      timestamps: true,
      paranoid: false,
      underscored: true,
      tableName: "payments",
      modelName: "Payment",
      indexes: [
        {
          unique: true,
          fields: ["user_id", "idempotency_key"],
          name: "payments_user_idempotency_key_unique_idx",
        },
        {
          fields: ["user_id", "created_at", "id"],
          name: "payments_user_created_at_idx",
        },
      ],
    },
  );

  return Payments;
}
