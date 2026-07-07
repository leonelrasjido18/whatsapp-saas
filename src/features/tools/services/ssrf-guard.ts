import { resolve4 } from "node:dns/promises";

const PRIVATE_RANGES: RegExp[] = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./, // link-local
  /^100\.6[4-9]\.|^100\.[7-9]\d\.|^100\.1[01]\d\.|^100\.12[0-7]\./, // CGNAT
  /^::1$/, // IPv6 loopback
  /^fc|^fd/i, // IPv6 ULA
];

/**
 * SEC-08: Validates a webhook URL before fetching.
 * Returns an error string if the URL is unsafe, null if it is safe.
 *
 * Checks:
 *   1. Must be a valid URL
 *   2. Protocol must be HTTPS
 *   3. Resolved IPv4 addresses must not be in private/internal ranges
 */
export async function validateWebhookUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL";
  }

  if (parsed.protocol !== "https:") {
    return "Only HTTPS webhooks are allowed (SEC-08)";
  }

  let addresses: string[] = [];
  try {
    addresses = await resolve4(parsed.hostname);
  } catch {
    return "Cannot resolve hostname";
  }

  for (const ip of addresses) {
    if (PRIVATE_RANGES.some((r) => r.test(ip))) {
      return `Blocked: ${ip} is a private/internal IP address (SEC-08 anti-SSRF)`;
    }
  }

  return null;
}
