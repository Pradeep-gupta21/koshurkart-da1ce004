/**
 * Canonical Return Validation Constants
 * 
 * These values are canonical business rules for return requests.
 * They MUST remain synchronized across the frontend, Edge Functions, 
 * mobile clients, and future APIs.
 */
export const MAX_RETURN_REASON_LENGTH = 200;
export const MAX_RETURN_DESCRIPTION_LENGTH = 1000;
export const MAX_RETURN_PHOTOS_COUNT = 4;
export const MAX_RETURN_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
