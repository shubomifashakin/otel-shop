import z from "zod";

export const paymentsQueryValidator = z.object({
  cursor: z.uuidv4().optional(),
});

export type paymentsQueryDto = z.infer<typeof paymentsQueryValidator>;

export const providerWebhookValidator = z.object({
  paymentId: z.uuidv4(),
  outcome: z.enum(["succeeded", "failed"]),
  reference: z.string().nonempty().nullable().default(null),
});

export type providerWebhookDto = z.infer<typeof providerWebhookValidator>;
