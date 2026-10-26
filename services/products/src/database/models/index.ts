export * from "./stock-reservations.js";

import {
  Model,
  DataTypes,
  Sequelize,
  InferAttributes,
  CreationOptional,
  InferCreationAttributes,
} from "sequelize";

export class Products extends Model<
  InferAttributes<Products>,
  InferCreationAttributes<Products>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string;
  declare price: string;
  declare currency: string;
  declare quantity: number;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

export function registerProductsModel(sequelize: Sequelize) {
  Products.init(
    {
      id: {
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        type: DataTypes.INTEGER,
      },
      name: {
        allowNull: false,
        type: DataTypes.STRING(255),
      },
      description: {
        allowNull: false,
        type: DataTypes.STRING(500),
      },
      currency: {
        allowNull: false,
        type: DataTypes.STRING(3),
      },
      price: {
        allowNull: false,
        type: DataTypes.BIGINT,
      },
      quantity: {
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
        type: DataTypes.INTEGER,
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      deletedAt: {
        allowNull: true,
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      paranoid: true,
      timestamps: true,
      underscored: true,
      tableName: "products",
      modelName: "Product",
      indexes: [
        {
          fields: ["name"],
          name: "name_idx",
          where: { deleted_at: null },
        },
      ],
    },
  );

  return Products;
}
