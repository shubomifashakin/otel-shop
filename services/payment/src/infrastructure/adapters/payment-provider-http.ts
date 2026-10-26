import { z } from "zod";

import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";

import {
  AcceptedPayment,
  PaymentIntent,
  PaymentProviderPort,
} from "../ports/index.js";

const acceptedResponseSchema = z.object({
  reference: z.string().nonempty(),
});

// in production this is an external service (like stripe, polar etc)
// does not belong in our service graph
export class HttpPaymentProviderAdapter implements PaymentProviderPort {
  constructor(
    private readonly baseUrl: string,
    private readonly callbackUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async pay(intent: PaymentIntent): Promise<AdapterResponse<AcceptedPayment>> {
    try {
      const response = await fetch(new URL("/payments", this.baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-idempotency-key": intent.idempotencyKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          paymentId: intent.paymentId,
          amount: intent.amount,
          currency: intent.currency,
          callbackUrl: this.callbackUrl,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: new Error(`provider responded with ${response.status}`),
        };
      }

      const parsed = acceptedResponseSchema.safeParse(await response.json());

      if (!parsed.success) {
        return {
          success: false,
          data: null,
          error: new Error(
            `unexpected provider payload: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".")} ${issue.message}`)
              .join("; ")}`,
          ),
        };
      }

      return {
        success: true,
        data: { providerReference: parsed.data.reference },
        error: null,
      };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
