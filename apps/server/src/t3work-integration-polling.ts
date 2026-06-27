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

export function createT3workPollFingerprint(value: unknown): string {
  return `sha256:${NodeCrypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
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
