// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node helper owned by the whisper host.
// @effect-diagnostics globalDate:off -- The sentinel persists wall-clock crash timestamps across launches.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * GGML aborts the whole process on some GPU/driver states. Before each GPU attempt we append a
 * timestamp; a successful transcription clears the file. Timestamps left behind therefore mean a
 * GPU attempt never finished, and a transient crash is retried once per window rather than looped
 * (design carried over from nx-activity-tracker `WhisperCrashSentinelPolicy`).
 */
export const SENTINEL_MAX_HISTORY = 20;
const SENTINEL_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

export type SentinelDecision = {
  readonly blocked: boolean;
  readonly retryAtMs: number | null;
  readonly crashCount: number;
};

export function parseSentinel(content: string | null): readonly number[] {
  if (!content) return [];
  return content
    .split("\n")
    .map((line) => Date.parse(line.trim()))
    .filter((value) => Number.isFinite(value));
}

export function evaluateSentinel(
  crashTimestampsMs: readonly number[],
  nowMs: number,
  retryAfterMs: number,
): SentinelDecision {
  if (crashTimestampsMs.length === 0) return { blocked: false, retryAtMs: null, crashCount: 0 };
  const newest = Math.max(...crashTimestampsMs);
  const crashCount = crashTimestampsMs.length;
  return nowMs - newest >= retryAfterMs
    ? { blocked: false, retryAtMs: null, crashCount }
    : { blocked: true, retryAtMs: newest + retryAfterMs, crashCount };
}

export function appendAttempt(content: string | null, nowMs: number): string {
  return [...parseSentinel(content), nowMs]
    .toSorted((a, b) => a - b)
    .slice(-SENTINEL_MAX_HISTORY)
    .map((timestamp) => new Date(timestamp).toISOString())
    .join("\n");
}

export type WhisperSentinel = {
  readonly evaluate: () => SentinelDecision;
  readonly arm: () => void;
  readonly clear: () => void;
};

export function makeFileSentinel(filePath: string, now: () => number = Date.now): WhisperSentinel {
  const read = (): string | null => {
    try {
      return NodeFS.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  };
  return {
    evaluate: () => evaluateSentinel(parseSentinel(read()), now(), SENTINEL_RETRY_AFTER_MS),
    arm: () => {
      NodeFS.mkdirSync(NodePath.dirname(filePath), { recursive: true });
      NodeFS.writeFileSync(filePath, appendAttempt(read(), now()));
    },
    clear: () => NodeFS.rmSync(filePath, { force: true }),
  };
}
