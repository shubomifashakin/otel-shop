import { RequestHandler } from "express";
import { ZodError } from "zod";

import { BadRequestError, ErrorDetail } from "@shop/types";

import { ProductsService } from "../services/index.js";
import { productIdValidator } from "../validators/index.js";

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  getList: RequestHandler = async (req, res) => {
    const cursor = req.query["cursor"];

    let nextId: number | undefined = undefined;
    if (cursor) {
      const parsed = productIdValidator.safeParse(cursor);

      if (!parsed.success) {
        throw new BadRequestError("Invalid cursor", toDetails(parsed.error));
      }

      nextId = parsed.data;
    }

    const products = await this.productsService.getMany(nextId);

    res.status(200).json(products);
  };

  getOne: RequestHandler = async (req, res) => {
    const id = productIdValidator.safeParse(req.params["id"]);

    if (!id.success) {
      throw new BadRequestError("Invalid product id", toDetails(id.error));
    }

    const product = await this.productsService.getOne(id.data);

    res.status(200).json(product);
  };
}
