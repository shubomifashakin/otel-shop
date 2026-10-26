import type { ZodError } from "zod";

import { ErrorDetail } from "@shop/types";

export function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
