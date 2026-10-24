import { randomUUID } from "node:crypto";

import {
  SignJWT,
  calculateJwkThumbprint,
  decodeJwt,
  exportJWK,
  importPKCS8,
  type CryptoKey,
  type JWK,
} from "jose";

import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";

import {
  AccessTokenPayload,
  DecodedAccessToken,
  JsonWebKeySet,
  SignedToken,
  TokenSignerPort,
} from "../ports/index.js";

const ALG = "RS256";

export type JoseTokenSignerOptions = {
  privateKeyBase64: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
};

export class JoseTokenSigner implements TokenSignerPort {
  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly publicJwk: JWK,
    private readonly options: JoseTokenSignerOptions,
  ) {}

  /**
   * Resolves the key material up front so a malformed or unreadable key fails
   * the boot instead of the first login. Every replica must be given the same
   * key, otherwise each one publishes a different key set and tokens stop
   * verifying as requests move between them.
   */
  static async create(
    options: JoseTokenSignerOptions,
  ): Promise<JoseTokenSigner> {
    const pem = Buffer.from(options.privateKeyBase64, "base64").toString(
      "utf8",
    );

    // extractable, or the public half cannot be derived for the key set
    const privateKey = await importPKCS8(pem, ALG, { extractable: true });

    // the exported private JWK carries the public parameters alongside the
    // secret ones, so the secret ones are dropped rather than the public ones
    // allow-listed; that keeps this correct if the key type ever changes
    const { d, p, q, dp, dq, qi, ...publicParams } =
      await exportJWK(privateKey);

    const publicJwk: JWK = { ...publicParams, alg: ALG, use: "sig" };

    // derived from the key itself, so rotating the key rotates the kid and
    // verifiers can tell the two apart
    publicJwk.kid = await calculateJwkThumbprint(publicJwk);

    return new JoseTokenSigner(privateKey, publicJwk, options);
  }

  async signAccessToken(
    payload: AccessTokenPayload,
  ): Promise<AdapterResponse<SignedToken>> {
    try {
      const issuedAt = new Date();
      const expiresAt = new Date(
        issuedAt.getTime() + this.options.accessTokenTtlSeconds * 1000,
      );

      const token = await new SignJWT({ email: payload.email })
        .setProtectedHeader({ alg: ALG, kid: this.publicJwk.kid })
        // gives every token an id, which is what revocation is keyed on
        .setJti(randomUUID())
        .setSubject(payload.sub)
        .setIssuer(this.options.issuer)
        .setAudience(this.options.audience)
        .setIssuedAt(issuedAt)
        // seconds, and taken from expiresAt so the claim and the returned
        // value can never disagree
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(this.privateKey);

      return { success: true, data: { token, expiresAt }, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }

  decodeAccessToken(token: string): AdapterResponse<DecodedAccessToken> {
    try {
      const claims = decodeJwt(token);

      if (typeof claims.jti !== "string" || claims.jti.length === 0) {
        throw new Error('token has no usable "jti" claim');
      }

      if (typeof claims.sub !== "string" || claims.sub.length === 0) {
        throw new Error('token has no usable "sub" claim');
      }

      if (typeof claims.exp !== "number") {
        throw new Error('token has no usable "exp" claim');
      }

      return {
        success: true,
        data: {
          jti: claims.jti,
          sub: claims.sub,
          expiresAt: new Date(claims.exp * 1000),
        },
        error: null,
      };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }

  async jwks(): Promise<AdapterResponse<JsonWebKeySet>> {
    try {
      return {
        success: true,
        data: { keys: [{ ...this.publicJwk }] },
        error: null,
      };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
