import dotenv from "dotenv";
import { z } from "zod";

import { createSequelizeConnection } from "../infrastructure/clients/index.js";
import { registerProductsModel } from "./models/index.js";

dotenv.config();

const { DATABASE_URL } = z.object({ DATABASE_URL: z.url() }).parse(process.env);

const PRODUCT_COUNT = 300;
const CURRENCY = "NGN";

const SEED = 20261025;

function mulberry32(seed: number) {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJECTIVES = [
  "Classic",
  "Premium",
  "Rugged",
  "Lightweight",
  "Compact",
  "Wireless",
  "Insulated",
  "Foldable",
  "Stainless",
  "Ceramic",
  "Matte",
  "Vintage",
];

const NOUNS = [
  "Headphones",
  "Kettle",
  "Backpack",
  "Desk Lamp",
  "Water Bottle",
  "Keyboard",
  "Mouse Pad",
  "Travel Mug",
  "Notebook",
  "Phone Stand",
  "Blender",
  "Fan",
  "Speaker",
  "Cable Organiser",
  "Chopping Board",
  "Door Mat",
];

const MATERIALS = [
  "Oak",
  "Slate",
  "Ivory",
  "Cobalt",
  "Amber",
  "Olive",
  "Crimson",
  "Graphite",
];

function buildProducts() {
  const random = mulberry32(SEED);
  const rows = [];

  for (let i = 0; i < PRODUCT_COUNT; i++) {
    const adjective = ADJECTIVES[i % ADJECTIVES.length];
    const noun = NOUNS[Math.floor(i / ADJECTIVES.length) % NOUNS.length];
    const material = MATERIALS[i % MATERIALS.length];

    const price = (Math.floor(random() * 4_950) + 50) * 100;

    const quantity = i % 10 === 0 ? 0 : Math.floor(random() * 200) + 1;

    rows.push({
      name: `${adjective} ${material} ${noun} #${i + 1}`,
      description: `A ${adjective.toLowerCase()} ${noun.toLowerCase()} finished in ${material.toLowerCase()}.`,
      price: String(price),
      currency: CURRENCY,
      quantity,
    });
  }

  return rows;
}

async function seed() {
  const sequelize = await createSequelizeConnection(DATABASE_URL);

  try {
    const Products = registerProductsModel(sequelize);

    await sequelize.sync();

    const existing = await Products.count();

    if (existing > 0 && !process.argv.includes("--force")) {
      console.log(
        `products already has ${existing} rows, leaving it alone. pass --force to replace them.`,
      );

      return;
    }

    if (existing > 0) {
      await Products.destroy({ where: {}, force: true, truncate: true });
      console.log(`removed ${existing} existing rows`);
    }

    const rows = buildProducts();

    await Products.bulkCreate(rows, { validate: true });

    const total = await Products.count();
    const outOfStock = await Products.count({ where: { quantity: 0 } });

    console.log(`seeded ${total} products, ${outOfStock} of them out of stock`);
  } finally {
    await sequelize.close();
  }
}

seed().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
