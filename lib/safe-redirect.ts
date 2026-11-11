/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeCallbackUrl(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
