import { ERROR_CODES } from './errorCodes';

export interface ValidationError {
  field: string;
  message: string;
  code: ERROR_CODES;
}
