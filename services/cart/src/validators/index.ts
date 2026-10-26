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

export const paymentOutcomeEventValidator = z.object({
  eventId: z.string().nonempty(),
  paymentId: z.string().nonempty(),
  userId: z.string().nonempty(),
  idempotencyKey: z.string().nonempty().max(255),
});

export type paymentOutcomeEventDto = z.infer<
  typeof paymentOutcomeEventValidator
>;
