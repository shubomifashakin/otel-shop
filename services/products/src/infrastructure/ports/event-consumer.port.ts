import { AdapterResponse } from "@shop/types";

export interface EventConsumerPort {
  start(): Promise<AdapterResponse<void>>;
}
