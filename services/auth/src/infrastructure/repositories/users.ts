import { UniqueConstraintError } from "sequelize";
import { UserModel } from "../../database/models/index.js";
import {
  User,
  UsersRepoPort,
  CreateUserInput,
  UserWithPasswordHash,
} from "../ports/index.js";
import { ConflictError } from "../../errors/index.js";

function toUser(model: UserModel): User {
  return {
    id: model.id,
    firstName: model.firstName,
    lastName: model.lastName,
    email: model.email,
    phone: model.phone,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export class UsersRepository implements UsersRepoPort {
  constructor(private readonly users: typeof UserModel) {}

  async findById(id: string): Promise<User | null> {
    const found = await this.users.findByPk(id, {
      attributes: { exclude: ["passwordHash"] },
    });

    return found ? toUser(found) : null;
  }

  async findByEmail(email: string): Promise<UserWithPasswordHash | null> {
    const found = await this.users.findOne({
      where: { email: email.trim().toLowerCase() },
    });

    if (!found) {
      return null;
    }

    return { ...toUser(found), passwordHash: found.passwordHash };
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const created = await this.users.create(input);

      return toUser(created);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConflictError("User already exists");
      }

      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    await this.users.destroy({ where: { id } });
  }
}
