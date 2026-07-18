import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";

export function validatePayoutRequest(body: any): PaymentError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_PAYLOAD, "Invalid JSON payload structure", false);
  }

  const { amount, methodId, idempotencyKey, p_idempotency_key: legacyKey } = body;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount must be a positive number", false);
  }

  if (methodId !== undefined && methodId !== null && typeof methodId !== "string") {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_METHOD_ID, "methodId must be a string", false);
  }

  if (legacyKey !== undefined && legacyKey !== null && legacyKey !== idempotencyKey) {
    return new PaymentError(
      ErrorCategory.VALIDATION,
      ERROR_CODES.CONFLICTING_IDEMPOTENCY_KEY_FORMATS,
      "Use \"idempotencyKey\" (not \"p_idempotency_key\"). Both are present but have different values.",
      false
    );
  }

  const resolvedKey = idempotencyKey ?? legacyKey;

  if (resolvedKey === undefined || resolvedKey === null) {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.MISSING_IDEMPOTENCY_KEY, "idempotencyKey is required in the request body", false);
  }

  if (typeof resolvedKey !== "string" || resolvedKey.trim() === "") {
    throw new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_IDEMPOTENCY_KEY, "idempotencyKey must be a non-empty string", false);
  }

  const payoutRegex = /^payout-\d+-[a-z0-9]{9}$/;
  if (!payoutRegex.test(resolvedKey)) {
    throw new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_IDEMPOTENCY_KEY_FORMAT, "idempotencyKey must be a valid payout key format", false);
  }

  return null;
}

export function validateActionRequest(body: any, requiresPaymentId = true): PaymentError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_PAYLOAD, "Invalid JSON payload structure", false);
  }

  if (requiresPaymentId) {
    if (typeof body.paymentId !== "string" || body.paymentId.trim() === "") {
      return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_PAYMENT_ID, "paymentId is required and must be a string", false);
    }
  }

  if (typeof body.orderId !== "string" || body.orderId.trim() === "") {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_ORDER_ID, "orderId is required and must be a string", false);
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_ACTION, "action must be \"approve\" or \"reject\"", false);
  }

  return null;
}

export function validateVendorApproveReturnRequest(body: any): PaymentError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_PAYLOAD, "Invalid JSON payload structure", false);
  }

  if (typeof body.order_item_id !== "string" || body.order_item_id.trim() === "") {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_ORDER_ITEM_ID, "order_item_id is required and must be a string", false);
  }

  const key = body.idempotency_key;
  if (key !== undefined && key !== null) {
    if (typeof key !== "string" || key.trim() === "" || key.length > 128) {
      return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_IDEMPOTENCY_KEY, "idempotency_key must be a non-empty string up to 128 characters", false);
    }
  }

  return null;
}
