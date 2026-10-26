import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type ReservationStatus = "reserved" | "sold" | "released" | "expired";

export const RESERVATION_STATUSES: ReservationStatus[] = [
  "reserved",
  "sold",
  "released",
  "expired",
];

export type ReservedItem = {
  id: number;
  qty: number;
};

export class StockReservations extends Model<
  InferAttributes<StockReservations>,
  InferCreationAttributes<StockReservations>
> {
  declare id: CreationOptional<string>;
  declare idempotencyKey: string;
  declare status: CreationOptional<ReservationStatus>;
  declare items: ReservedItem[];

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare expiresAt: Date;
}

export function registerStockReservationsModel(sequelize: Sequelize) {
  StockReservations.init(
    {
      id: {
        primaryKey: true,
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      idempotencyKey: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...RESERVATION_STATUSES),
        allowNull: false,
        defaultValue: "reserved",
      },
      items: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
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
      tableName: "stock_reservations",
      modelName: "StockReservation",
      indexes: [
        {
          unique: true,
          fields: ["idempotency_key"],
          name: "stock_reservations_idempotency_key_unique_idx",
        },
        {
          fields: ["status", "expires_at"],
          name: "stock_reservations_status_expires_at_idx",
        },
      ],
    },
  );

  return StockReservations;
}
