import { ERROR_CODES } from "./errorCodes.ts";
import { ErrorResponse, createErrorResponse } from "./errorResponse.ts";

export function normalizeRpcError(rpcErr: any): ErrorResponse {
  if (!rpcErr) {
    return createErrorResponse("Internal server error occurred.", ERROR_CODES.INTERNAL_ERROR, 500);
  }

  // Common PostgreSQL SQLSTATE codes
  switch (rpcErr.code) {
    case "23505": // unique_violation
      return createErrorResponse(rpcErr.message || "A conflict occurred (unique violation).", ERROR_CODES.CONFLICT, 409);
    case "23503": // foreign_key_violation
      return createErrorResponse(rpcErr.message || "Invalid reference to a related record.", ERROR_CODES.BAD_REQUEST, 400);
    case "40001": // serialization_failure
      return createErrorResponse(rpcErr.message || "Transaction serialization failed. Please retry.", ERROR_CODES.CONFLICT, 409, true);
    case "42P01": // undefined_table
      return createErrorResponse("Internal server error (database table missing).", ERROR_CODES.INTERNAL_ERROR, 500);
    case "42501": // insufficient_privilege
      return createErrorResponse(rpcErr.message || "Insufficient database privileges.", ERROR_CODES.FORBIDDEN, 403);
    default:
      if (rpcErr.code && typeof rpcErr.code === "string" && rpcErr.code.startsWith("P")) { // Application specific raised errors in PL/pgSQL
         return createErrorResponse(rpcErr.message || "An application error occurred.", ERROR_CODES.BAD_REQUEST, 400);
      }
      return createErrorResponse(rpcErr.message || "Internal server error occurred.", ERROR_CODES.INTERNAL_ERROR, 500);
  }
}
