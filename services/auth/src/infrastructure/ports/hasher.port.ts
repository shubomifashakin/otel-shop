import { AdapterResponse } from "@shop/types";

export interface HasherPort {
  hash(password: string): Promise<AdapterResponse<string>>;

  verify(plain: string, hash: string): Promise<AdapterResponse<boolean>>;
}
