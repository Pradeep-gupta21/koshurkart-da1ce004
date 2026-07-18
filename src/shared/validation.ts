import { ERROR_CODES } from './errorCodes.ts';

export interface ValidationError {
  field: string;
  message: string;
  code: ERROR_CODES;
}
