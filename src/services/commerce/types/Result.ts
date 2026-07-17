export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface CommerceError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
