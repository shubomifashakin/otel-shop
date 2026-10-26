import { RequestHandler } from "express";
import z from "zod";

import { BadRequestError } from "@shop/types";

import { CartService } from "../services/index.js";

const userIdParam = z.uuidv4();

export class InternalCartController {
  constructor(private readonly cartService: CartService) {}

  getCart: RequestHandler = async (req, res) => {
    const userId = userIdParam.safeParse(req.params["userId"]);

    if (!userId.success) {
      throw new BadRequestError("Invalid user id");
    }

    const items = await this.cartService.getAllItems(userId.data);

    res.status(200).json({ products: items });
  };
}
