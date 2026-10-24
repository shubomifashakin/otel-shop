import { errors, jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

export type TokenClaims = JWTPayload & { sub: string; jti: string };

export type VerifyResult =
  | { ok: true; claims: TokenClaims; error: null }
  | { ok: false; reason: "invalid_token" | "unavailable"; error: Error };

export interface TokenVerifierPort {
  verify(token: string): Promise<VerifyResult>;
  warmUp(): Promise<void>;
}

export type TokenVerifierOptions = {
  jwksUrl: string;
  issuer: string;
  audience: string;
  cacheMaxAgeMs?: number;
  cooldownMs?: number;
  timeoutMs?: number;
};

const UNAVAILABLE_CODES = new Set(["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID"]);

function getErrorType(err: unknown): "invalid_token" | "unavailable" {
  if (!(err instanceof errors.JOSEError)) {
    return "unavailable";
  }

  return UNAVAILABLE_CODES.has(String(err.code))
    ? "unavailable"
    : "invalid_token";
}

export function createTokenVerifier(
  options: TokenVerifierOptions,
): TokenVerifierPort {
  const { jwksUrl, issuer, audience } = options;

  const jwks = createRemoteJWKSet(new URL(jwksUrl), {
    ...(options.cacheMaxAgeMs !== undefined && {
      cacheMaxAge: options.cacheMaxAgeMs,
    }),
    ...(options.cooldownMs !== undefined && {
      cooldownDuration: options.cooldownMs,
    }),
    ...(options.timeoutMs !== undefined && {
      timeoutDuration: options.timeoutMs,
    }),
  });

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ["RS256"],
        });

        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
          return {
            ok: false,
            reason: "invalid_token",
            error: new Error('token has no usable "sub" claim'),
          };
        }

        if (typeof payload.jti !== "string" || !payload.jti.length) {
          return {
            ok: false,
            reason: "invalid_token",
            error: new Error('token has no usable "jti" claim'),
          };
        }

        return { ok: true, claims: payload as TokenClaims, error: null };
      } catch (err) {
        return {
          ok: false,
          reason: getErrorType(err),
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    },

    async warmUp() {
      await jwks.reload();
    },
  };
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}
