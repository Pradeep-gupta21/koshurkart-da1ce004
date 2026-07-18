export interface RpcErrorResponse {
  error: string;
  status: number;
  errorCode: string;
}

export function handleRpcError(rpcErr: any, defaultErrorMessage = "Internal server error"): RpcErrorResponse {
  if (!rpcErr) return { error: "Internal server error occurred.", status: 500, errorCode: "INTERNAL_ERROR" };

  const code = rpcErr.code;
  const msg = rpcErr.message || defaultErrorMessage;

  // 23505: unique_violation
  if (code === "23505") {
    return { error: msg, status: 409, errorCode: "CONFLICT" };
  }

  // 42501: insufficient_privilege
  if (code === "42501") {
    return { error: msg, status: 403, errorCode: "FORBIDDEN" };
  }

  // 23503: foreign_key_violation
  if (code === "23503") {
    return { error: msg, status: 400, errorCode: "BAD_REQUEST" };
  }

  // P0001: raise_exception (PL/pgSQL RAISE EXCEPTION)
  if (code === "P0001") {
    // Custom logic for known application-level conflicts
    if (msg.includes("Idempotency key collision") || msg.includes("IDEMPOTENCY_TERMINAL")) {
      return { error: msg, status: 409, errorCode: "CONFLICT" };
    }
    // Most other RAISE EXCEPTIONs are business validation failures
    return { error: msg, status: 400, errorCode: "BAD_REQUEST" };
  }

  // Default
  return { error: "Internal server error occurred.", status: 500, errorCode: "INTERNAL_ERROR" };
}

