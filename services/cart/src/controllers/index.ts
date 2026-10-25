import { RequestHandler } from "express";
import type { ZodError } from "zod";

import { BadRequestError, ErrorDetail, UnauthorizedError } from "@shop/types";

import { CartService } from "../services/index.js";
import {
  addToCartValidator,
  cartQueryValidator,
  productIdParamValidator,
  updateCartItemValidator,
} from "../validators/index.js";

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export class CartController {
  constructor(private readonly cartService: CartService) {}

  getItems: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const query = cartQueryValidator.safeParse(req.query);

    if (!query.success) {
      throw new BadRequestError("Invalid query", toDetails(query.error));
    }

    const items = await this.cartService.getItems(userId, query.data.cursor);

    res.status(200).json(items);
  };

  addItem: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const body = addToCartValidator.safeParse(req.body);

    if (!body.success) {
      throw new BadRequestError("Invalid request body", toDetails(body.error));
    }

    await this.cartService.addItem(body.data, userId);

    res.status(201).json({ message: "success" });
  };

  updateItem: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const productId = productIdParamValidator.safeParse(req.params["id"]);

    if (!productId.success) {
      throw new BadRequestError(
        "Invalid product id",
        toDetails(productId.error),
      );
    }

    const body = updateCartItemValidator.safeParse(req.body);

    if (!body.success) {
      throw new BadRequestError("Invalid request body", toDetails(body.error));
    }

    await this.cartService.updateItem(body.data, productId.data, userId);

    res.status(200).json({ message: "success" });
  };

  removeItem: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const productId = productIdParamValidator.safeParse(req.params["id"]);

    if (!productId.success) {
      throw new BadRequestError(
        "Invalid product id",
        toDetails(productId.error),
      );
    }

    await this.cartService.removeItem(productId.data, userId);

    res.status(200).json({ message: "success" });
  };

  clear: RequestHandler = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    await this.cartService.clear(userId);

    res.status(200).json({ message: "success" });
  };
}
