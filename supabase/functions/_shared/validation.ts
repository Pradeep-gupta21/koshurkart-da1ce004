import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";

export function parseAmountToPaise(amount: unknown): { paise?: number, error?: PaymentError } {
  if (amount === undefined || amount === null) {
    return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount is required", false) };
  }

  let amtStr = "";
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount must be a finite number", false) };
    }
    
    // CONSERVATIVE NUMERIC RANGE:
    // Floating point precision degrades at large magnitudes. We enforce a strict upper bound
    // of 10,000,000 on raw numbers. For larger amounts, the client MUST send a decimal string.
    if (amount > 10000000) {
      return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "Numeric amounts > 10,000,000 are unsafe. Send as decimal string.", false) };
    }

    // Number.toString() correctly avoids floating point drift (e.g. 10.5 -> "10.5")
    amtStr = amount.toString();
  } else if (typeof amount === "string") {
    amtStr = amount;
  } else {
    return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount must be a number or string", false) };
  }

  // Exact decimal-string -> integer-paise parser
  // Reject exponent notation, NaN, Infinity, negative, multi-dots, or >2 fractional digits.
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amtStr)) {
    return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount must be a positive decimal with up to 2 fractional digits", false) };
  }

  const parts = amtStr.split(".");
  const wholeStr = parts[0];
  const fracStr = parts[1] || "";
  
  // Convert safely to integer paise
  const paiseStr = wholeStr + fracStr.padEnd(2, "0");
  const paise = parseInt(paiseStr, 10);

  if (paise <= 0) {
    return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount must be strictly greater than 0", false) };
  }

  // Enforce JS MAX_SAFE_INTEGER (9007199254740991). PostgreSQL BIGINT is slightly larger,
  // but we must safely represent it in JS before passing to the RPC.
  if (paise > Number.MAX_SAFE_INTEGER) {
    return { error: new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_AMOUNT, "amount exceeds safe integer limits", false) };
  }

  return { paise };
}

export function validatePayoutRequest(body: any): PaymentError | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INVALID_PAYLOAD, "Invalid JSON payload structure", false);
  }

  const { amount, methodId, idempotencyKey, p_idempotency_key: legacyKey } = body;

  const amountResult = parseAmountToPaise(amount);
  if (amountResult.error) {
    return amountResult.error;
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
