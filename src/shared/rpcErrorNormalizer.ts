import { ERROR_CODES } from "./errorCodes.ts";
import { PaymentError } from "./errorResponse.ts";
import { ErrorCategory } from "./statusCodeMap.ts";

export function normalizeRpcError(rpcErr: any): PaymentError {
  if (!rpcErr) {
    return new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error occurred.", false);
  }

  // Canonical RPC JSON response
  if (rpcErr.errorCode) {
    switch (rpcErr.errorCode) {
      case "NOT_FOUND":
        return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.NOT_FOUND, "Resource not found.", false);
      case "FORBIDDEN":
        return new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.FORBIDDEN, "Forbidden.", false);
      case "VALIDATION_FAILED":
        return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "Validation failed.", false);
      case "RETURN_ALREADY_PROCESSED":
      case "RETURN_NOT_PENDING":
        return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "The return request is in an invalid state for this operation.", false);
      case "CONFLICT":
        return new PaymentError(ErrorCategory.CONFLICT, ERROR_CODES.CONFLICT, "Transaction conflict. Please retry.", true);
      case "PAYMENT_NOT_FOUND":
        return new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.NOT_FOUND, "Payment missing.", false);
      case "INTERNAL_ERROR":
      default:
        return new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error occurred.", false);
    }
  }

  // Common PostgreSQL SQLSTATE codes
  switch (rpcErr.code) {
    case "23505": // unique_violation
      return new PaymentError(ErrorCategory.CONFLICT, ERROR_CODES.CONFLICT, "A conflict occurred (unique violation).", false);
    case "23503": // foreign_key_violation
      return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "Invalid reference to a related record.", false);
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected
      return new PaymentError(ErrorCategory.CONFLICT, ERROR_CODES.CONFLICT, "Transaction serialization failed. Please retry.", true);
    case "42P01": // undefined_table
      return new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error (database table missing).", false);
    case "42501": // insufficient_privilege
      return new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.FORBIDDEN, "Insufficient database privileges.", false);
    default:
      if (rpcErr.code && typeof rpcErr.code === "string" && rpcErr.code.startsWith("P")) { 
        // Application specific raised errors in PL/pgSQL
         return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "A database validation error occurred.", false);
      }
      return new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error occurred.", false);
  }
}
