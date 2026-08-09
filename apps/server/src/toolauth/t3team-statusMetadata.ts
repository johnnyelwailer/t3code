/**
 * Pure credential-file/metadata parsing for `probeStatus` in `t3team-status.ts`.
 * Kept separate (and Effect-free) so this stays trivially unit-testable and
 * mirrors why `t3team-installFlow.ts` holds the install flow's pure helpers
 * next to its service.
 *
 * Privacy rule: credential files are read for expiry/account metadata ONLY.
 * `account`/`organization` are narrow, adapter-authored regexes that target
 * specific fields (never the whole blob); the raw file text is never logged,
 * returned, or transmitted, and other fields (access tokens, refresh
 * tokens, ...) are never inspected.
 *
 * @module toolauth/statusMetadata
 */
import type { ToolAuthAdapter } from "./t3team-types.ts";

export const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000;
const MS_EPOCH_THRESHOLD = 1_000_000_000_000;

export function resolveDotPath(record: unknown, dotPath: string): unknown {
  let cursor: unknown = record;
  for (const segment of dotPath.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Normalizes epoch-seconds, epoch-ms, or an ISO string into epoch-ms. */
export function normalizeExpiry(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < MS_EPOCH_THRESHOLD ? raw * 1000 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function parseCredentialExpiry(
  adapter: ToolAuthAdapter,
  fileText: string,
): number | undefined {
  const dotPath = adapter.status.credentialExpiryPath;
  if (!dotPath) return undefined;
  try {
    const parsed: unknown = JSON.parse(fileText);
    return normalizeExpiry(resolveDotPath(parsed, dotPath));
  } catch {
    return undefined;
  }
}

// account/organization are kept SEPARATE (never joined into one string):
// they are independent facts the CLI may or may not report, and mashing
// them together is exactly how an unrelated field (authMethod, apiProvider,
// ...) ends up misread as part of an "account".
export function extractLabel(pattern: RegExp | undefined, text: string): string | undefined {
  if (!pattern || text.length === 0) return undefined;
  return pattern.exec(text)?.[1]?.trim() || undefined;
}
