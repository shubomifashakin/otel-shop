export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserWithPasswordHash = User & { passwordHash: string };

export type CreateUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passwordHash: string;
};

export interface UsersRepoPort {
  findById(id: string): Promise<User | null>;

  findByEmail(email: string): Promise<UserWithPasswordHash | null>;

  create(input: CreateUserInput): Promise<User>;

  delete(id: string): Promise<void>;
}
