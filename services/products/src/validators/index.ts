import z from "zod";

export const productIdValidator = z.coerce
  .number()
  .int()
  .positive()
  .max(2147483647);
