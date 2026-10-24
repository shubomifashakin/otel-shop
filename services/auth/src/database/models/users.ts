import {
  Model,
  Sequelize,
  DataTypes,
  InferAttributes,
  CreationOptional,
  InferCreationAttributes,
} from "sequelize";

export class UserModel extends Model<
  InferAttributes<UserModel>,
  InferCreationAttributes<UserModel>
> {
  declare id: CreationOptional<string>;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare phone: string;
  declare passwordHash: string;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

export function registerUserModel(sequelize: Sequelize) {
  UserModel.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      firstName: {
        type: DataTypes.STRING(250),
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING(250),
        allowNull: false,
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(250),
        allowNull: false,
        validate: {
          isEmail: true,
        },
        set(value: string) {
          this.setDataValue("email", value.trim().toLowerCase());
        },
      },
      phone: {
        type: DataTypes.STRING(20),
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
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      paranoid: true,
      timestamps: true,
      tableName: "users",
      modelName: "User",
      indexes: [
        {
          unique: true,
          fields: ["email"],
          name: "email_unique_idx",
          where: { deleted_at: null },
        },
        {
          unique: true,
          fields: ["phone"],
          name: "phone_unique_idx",
          where: { deleted_at: null },
        },
      ],
      underscored: true,
    },
  );

  return UserModel;
}
