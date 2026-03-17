/**
 * Strip HTML tags, trim whitespace, and normalize internal whitespace.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lowercase and trim an email address.
 */
export function sanitizeEmail(input: string): string {
  return input.toLowerCase().trim();
}

/**
 * Sanitize all string values in an object (shallow).
 */
export function sanitizeFormValues<T extends Record<string, unknown>>(values: T): T {
  const result = { ...values };
  for (const key in result) {
    if (typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = sanitizeText(result[key] as string);
    }
  }
  return result;
}
