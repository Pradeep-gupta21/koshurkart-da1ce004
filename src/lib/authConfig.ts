/**
 * Production URLs used for every auth email/OAuth redirect. Hardcoded to the
 * live domain so preview/dev environments never leak into outgoing emails.
 */
export const PRODUCTION_URL = "https://koshurkart.shop";
export const AUTH_CALLBACK_URL = `${PRODUCTION_URL}/auth/callback`;
export const PASSWORD_RESET_URL = AUTH_CALLBACK_URL;
