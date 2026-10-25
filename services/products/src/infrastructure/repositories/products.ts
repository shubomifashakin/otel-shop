import { Op } from "sequelize";

import { Products } from "../../database/models/index.js";
import { ProductInfo, ProductsRepoPort } from "../ports/index.js";

function toProductInfo(model: Products): ProductInfo {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    price: model.price,
    currency: model.currency,
    quantity: model.quantity,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export class ProductsRepository implements ProductsRepoPort {
  constructor(private readonly products: typeof Products) {}

  async findOne(id: number): Promise<ProductInfo | null> {
    const found = await this.products.findByPk(id);

    return found ? toProductInfo(found) : null;
  }

  async findMany(limit: number, cursor?: number): Promise<ProductInfo[]> {
    const found = await this.products.findAll({
      ...(cursor !== undefined && { where: { id: { [Op.gt]: cursor } } }),
      order: [["id", "ASC"]],
      limit,
    });

    return found.map(toProductInfo);
  }
}
