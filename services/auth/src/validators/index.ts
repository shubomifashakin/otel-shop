import z from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export const signUpValidator = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(72, "Password must be at most 72 characters long")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[^A-Za-z0-9]/, "Password must contain a special character"),
  firstName: z.string().min(3).max(100),
  lastName: z.string().min(3).max(100),
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const parsed = parsePhoneNumberFromString(value);

      if (!parsed?.isValid()) {
        ctx.addIssue({
          code: "custom",
          message:
            "Phone must be a valid international number, e.g. +2348012345678",
        });

        return z.NEVER;
      }

      return parsed.number;
    }),
});

export type signUpDto = z.infer<typeof signUpValidator>;

export const loginValidator = z.object({
  email: z.email(),
  password: z.string(),
});

export type loginDto = z.infer<typeof loginValidator>;
