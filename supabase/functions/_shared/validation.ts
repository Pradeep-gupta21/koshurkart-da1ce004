export interface ValidationError {
  error: string;
  errorCode: string;
}

export function validatePayoutRequest(body: any): ValidationError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Invalid JSON payload structure", errorCode: "INVALID_PAYLOAD" };
  }

  const { amount, methodId, idempotencyKey, p_idempotency_key: legacyKey } = body;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { error: "amount must be a positive number", errorCode: "INVALID_AMOUNT" };
  }

  if (methodId !== undefined && methodId !== null && typeof methodId !== "string") {
    return { error: "methodId must be a string", errorCode: "INVALID_METHOD_ID" };
  }

  if (legacyKey !== undefined && legacyKey !== null && legacyKey !== idempotencyKey) {
    return {
      error: "Use \"idempotencyKey\" (not \"p_idempotency_key\"). Both are present but have different values.",
      errorCode: "CONFLICTING_IDEMPOTENCY_KEY_FORMATS",
    };
  }

  const resolvedKey = idempotencyKey ?? legacyKey;

  if (resolvedKey === undefined || resolvedKey === null) {
    return { error: "idempotencyKey is required in the request body", errorCode: "MISSING_IDEMPOTENCY_KEY" };
  }

  if (typeof resolvedKey !== "string" || resolvedKey.trim() === "") {
    return { error: "idempotencyKey must be a non-empty string", errorCode: "INVALID_IDEMPOTENCY_KEY" };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(resolvedKey)) {
    return { error: "idempotencyKey must be a valid UUIDv4", errorCode: "INVALID_IDEMPOTENCY_KEY_FORMAT" };
  }

  return null;
}

export function validateActionRequest(body: any, requiresPaymentId = true): ValidationError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Invalid JSON payload structure", errorCode: "INVALID_PAYLOAD" };
  }

  if (requiresPaymentId) {
    if (typeof body.paymentId !== "string" || body.paymentId.trim() === "") {
      return { error: "paymentId is required and must be a string", errorCode: "INVALID_PAYMENT_ID" };
    }
  }

  if (typeof body.orderId !== "string" || body.orderId.trim() === "") {
    return { error: "orderId is required and must be a string", errorCode: "INVALID_ORDER_ID" };
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return { error: "action must be \"approve\" or \"reject\"", errorCode: "INVALID_ACTION" };
  }

  return null;
}

export function validateVendorApproveReturnRequest(body: any): ValidationError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Invalid JSON payload structure", errorCode: "INVALID_PAYLOAD" };
  }

  if (typeof body.order_item_id !== "string" || body.order_item_id.trim() === "") {
    return { error: "order_item_id is required and must be a string", errorCode: "INVALID_ORDER_ITEM_ID" };
  }

  const key = body.idempotency_key;
  if (key !== undefined && key !== null) {
    if (typeof key !== "string" || key.trim() === "" || key.length > 128) {
      return { error: "idempotency_key must be a non-empty string up to 128 characters", errorCode: "INVALID_IDEMPOTENCY_KEY" };
    }
  }

  return null;
}

