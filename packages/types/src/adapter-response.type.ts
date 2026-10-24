export type AdapterResponse<T> =
  | { success: true; error: null; data: T }
  | { success: false; error: Error; data: null };
