/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeCrypto from "node:crypto";

export type T3workPollEnvelope = {
  readonly enabled: true;
  readonly knownFingerprint?: string;
};

export type T3workPollResult<T> =
  | {
      readonly unchanged: true;
      readonly fingerprint: string;
    }
  | {
      readonly unchanged: false;
      readonly fingerprint: string;
      readonly value: T;
    };

function normalizeFingerprint(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Recursively sorts object keys so two structurally identical values produce
 * the same JSON.stringify output regardless of key insertion order. Arrays
 * keep their order (order is meaningful there); only plain object keys are
 * sorted.
 */
function canonicalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForFingerprint);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalizeForFingerprint((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function createT3workPollFingerprint(value: unknown): string {
  return `sha256:${NodeCrypto.createHash("sha256")
    .update(JSON.stringify(canonicalizeForFingerprint(value)))
    .digest("hex")}`;
}

export function toT3workPollResult<T>(value: T, poll: T3workPollEnvelope): T3workPollResult<T> {
  const fingerprint = createT3workPollFingerprint(value);
  if (normalizeFingerprint(poll.knownFingerprint) === fingerprint) {
    return {
      unchanged: true,
      fingerprint,
    };
  }

  return {
    unchanged: false,
    fingerprint,
    value,
  };
}
