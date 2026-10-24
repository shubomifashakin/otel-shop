import { Sequelize, Transaction } from "sequelize";

export async function createSequelizeConnection(url: string) {
  const client = new Sequelize(url, {
    logging: false,
    dialect: "postgres",
    pool: { min: 0, max: 5, idle: 10 * 1000, acquire: 30 * 1000 },
    dialectOptions: {
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000,
      lock_timeout: 10_000,
    },
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
  });

  await client.authenticate();

  return client;
}
