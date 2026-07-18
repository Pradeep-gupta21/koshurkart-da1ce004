export interface RpcErrorResponse {
  error: string;
  status: number;
}

export function handleRpcError(rpcErr: any, defaultErrorMessage = "Internal server error"): RpcErrorResponse {
  if (!rpcErr) return { error: defaultErrorMessage, status: 500 };

  const code = rpcErr.code;
  const msg = rpcErr.message || defaultErrorMessage;

  // 23505: unique_violation
  if (code === "23505") {
    return { error: msg, status: 409 };
  }

  // 42501: insufficient_privilege
  if (code === "42501") {
    return { error: msg, status: 403 };
  }

  // 23503: foreign_key_violation
  if (code === "23503") {
    return { error: msg, status: 400 };
  }

  // P0001: raise_exception (PL/pgSQL RAISE EXCEPTION)
  if (code === "P0001") {
    // Custom logic for known application-level conflicts
    if (msg.includes("Idempotency key collision") || msg.includes("IDEMPOTENCY_TERMINAL")) {
      return { error: msg, status: 409 };
    }
    // Most other RAISE EXCEPTIONs are business validation failures
    return { error: msg, status: 400 };
  }

  // Default
  return { error: defaultErrorMessage, status: 500 };
}

