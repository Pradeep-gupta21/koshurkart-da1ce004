/**
 * Production URL used for email links (signup confirmation, password reset, etc.)
 * so outbound emails always point to the live site regardless of environment.
 */
export const PRODUCTION_URL = "https://koshurkart.shop";
export const AUTH_CALLBACK_URL = `${PRODUCTION_URL}/auth/callback`;
export const PASSWORD_RESET_URL = AUTH_CALLBACK_URL;

/**
 * Dynamic callback URL for OAuth flows. Uses the current window origin so
 * preview, dev, and production environments all redirect back to themselves.
 * Do NOT use this for email templates — use AUTH_CALLBACK_URL there.
 */
export const getAuthCallbackUrl = () =>
  typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : AUTH_CALLBACK_URL;
