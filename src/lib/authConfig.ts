/**
 * Production URLs used for all auth redirects (email confirmation, password
 * reset, OAuth callback). Hardcoded to the live domain so preview/dev
 * environments never leak into outgoing emails.
 */
export const PRODUCTION_URL = "https://koshurkart.shop";
export const AUTH_CALLBACK_URL = `${PRODUCTION_URL}/auth/callback`;
export const PASSWORD_RESET_URL = `${PRODUCTION_URL}/auth/reset-password`;
