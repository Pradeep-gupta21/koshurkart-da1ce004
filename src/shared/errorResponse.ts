import { ERROR_CODES } from "./errorCodes.ts";

export interface ErrorResponse {
  success: false;
  error: string;
  errorCode: ERROR_CODES | string;
  httpStatus: number;
  retryable?: boolean;
}

export function createErrorResponse(
  error: string,
  errorCode: ERROR_CODES | string,
  httpStatus: number,
  retryable: boolean = false
): ErrorResponse {
  return {
    success: false,
    error,
    errorCode,
    httpStatus,
    retryable,
  };
}
