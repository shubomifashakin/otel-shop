import z from "zod";

export const addToCartValidator = z.object({
  productId: z.coerce.number().int().positive().max(2147483647),
  quantity: z.coerce.number().int().positive().max(100),
});

export type addToCartDto = z.infer<typeof addToCartValidator>;

export const updateCartItemValidator = addToCartValidator.pick({
  quantity: true,
});

export type updateCartItemDto = z.infer<typeof updateCartItemValidator>;

export const productIdParamValidator = addToCartValidator.shape.productId;

export const cartQueryValidator = z.object({
  cursor: productIdParamValidator.optional(),
});

export type cartQueryDto = z.infer<typeof cartQueryValidator>;
