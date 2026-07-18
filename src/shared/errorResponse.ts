import { ERROR_CODES } from './errorCodes';
import { ErrorCategory, statusCodeMap } from './statusCodeMap';
import { ValidationError } from './validation';

export class PaymentError extends Error {
  public readonly category: ErrorCategory;
  public readonly errorCode: ERROR_CODES;
  public readonly clientMessage: string;
  public readonly retryable: boolean;
  public readonly validationErrors?: ValidationError[];

  constructor(
    category: ErrorCategory,
    errorCode: ERROR_CODES,
    clientMessage: string,
    retryable: boolean,
    validationErrors?: ValidationError[]
  ) {
    super(clientMessage);
    this.name = 'PaymentError';
    this.category = category;
    this.errorCode = errorCode;
    this.clientMessage = clientMessage;
    this.retryable = retryable;
    this.validationErrors = validationErrors;

    // Set the prototype explicitly for extending built-in Error
    Object.setPrototypeOf(this, PaymentError.prototype);
  }

  public toResponse() {
    return {
      status: statusCodeMap[this.category],
      body: {
        error: {
          code: this.errorCode,
          message: this.clientMessage,
          retryable: this.retryable,
          ...(this.validationErrors && { validationErrors: this.validationErrors }),
        },
      },
    };
  }
}

export function respondWithError(err: PaymentError, headers: Record<string, string> = {}) {
  const res = err.toResponse();
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
