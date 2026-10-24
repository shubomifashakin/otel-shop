import { AdapterResponse } from "@shop/types";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export type SignedToken = {
  token: string;
  /** when the token stops verifying, so callers can match a cookie's maxAge to it */
  expiresAt: Date;
};

export type DecodedAccessToken = {
  /** the token's own id, which is what a revocation list is keyed on */
  jti: string;
  sub: string;
  expiresAt: Date;
};

/**
 * Public half of the signing keys, served verbatim at
 * /.well-known/jwks.json. Kept structural so the signing library does not
 * leak through the port.
 */
export type JsonWebKeySet = {
  keys: Record<string, unknown>[];
};

export interface TokenSignerPort {
  signAccessToken(payload: AccessTokenPayload): Promise<AdapterResponse<SignedToken>>;

  /**
   * Reads the claims without checking the signature, so the result must not be
   * treated as proof of anything. Synchronous because it does no I/O.
   */
  decodeAccessToken(token: string): AdapterResponse<DecodedAccessToken>;

  jwks(): Promise<AdapterResponse<JsonWebKeySet>>;
}
