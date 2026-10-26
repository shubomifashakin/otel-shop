import z from "zod";

export const productIdValidator = z.coerce
  .number()
  .int()
  .positive()
  .max(2147483647);

export const stockMutationValidator = z.object({
  items: z
    .array(
      z.object({
        id: productIdValidator,
        qty: z.coerce.number().int().positive().max(1000),
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "items must not repeat a product",
    ),
});

export type stockMutationDto = z.infer<typeof stockMutationValidator>;

export const paymentOutcomeEventValidator = z.object({
  eventId: z.string().nonempty(),
  paymentId: z.string().nonempty(),
  idempotencyKey: z.string().nonempty().max(255),
});

export type paymentOutcomeEventDto = z.infer<
  typeof paymentOutcomeEventValidator
>;
