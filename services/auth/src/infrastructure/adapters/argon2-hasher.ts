import * as argon2 from "argon2";

import { makeError } from "@shop/utils";
import { AdapterResponse } from "@shop/types";
import { HasherPort } from "../ports/index.js";

export class Argon2Hasher implements HasherPort {
  async hash(password: string): Promise<AdapterResponse<string>> {
    try {
      const hash = await argon2.hash(password, {});

      return { success: true, data: hash, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }

  async verify(plain: string, hash: string): Promise<AdapterResponse<boolean>> {
    try {
      const valid = await argon2.verify(hash, plain);

      return { success: true, data: valid, error: null };
    } catch (err) {
      return { success: false, data: null, error: makeError(err) };
    }
  }
}
