/**
 * Transcription engine protocol shared by the desktop main process, the preload bridge and the
 * native helpers (native/t3team-transcription/*).
 *
 * Helpers speak JSON lines on stdout:
 *   {"type":"probe","engine":"macos-speech","available":true,"onDevice":true,"authorization":"authorized","locales":[...]}
 *   {"type":"ready","engine":"...","locale":"de-CH","onDevice":true}
 *   {"type":"partial","text":"hello wor"}      interim hypothesis for the current utterance
 *   {"type":"final","text":"Hello world."}     committed chunk (appended by the UI)
 *   {"type":"level","level":0.42}              optional input level 0..1
 *   {"type":"warning","code":"...","message":"..."}
 *   {"type":"error","code":"permission-denied"|"unsupported-locale"|"unavailable"|"no-microphone"|"failed","message":"..."}
 *   {"type":"end"}
 * and accept "stop\n" (or stdin EOF) to finish and flush the last final.
 */

export type TranscriptionErrorCode =
  | "permission-denied"
  | "unsupported-locale"
  | "unsupported-os"
  | "unavailable"
  | "no-microphone"
  | "failed";

export type TranscriptionEvent =
  | {
      readonly type: "ready";
      readonly engine: string;
      readonly locale: string;
      readonly onDevice?: boolean;
    }
  | { readonly type: "partial"; readonly text: string }
  | { readonly type: "final"; readonly text: string }
  | { readonly type: "level"; readonly level: number }
  | { readonly type: "warning"; readonly code: string; readonly message: string }
  | { readonly type: "error"; readonly code: TranscriptionErrorCode; readonly message: string }
  | { readonly type: "end" };

export interface TranscriptionProbe {
  readonly available: boolean;
  readonly onDevice?: boolean;
  readonly authorization?: string;
  readonly locales?: ReadonlyArray<string>;
  /** Why the engine is unavailable (shown in the UI tooltip / logs). */
  readonly reason?: string;
}

export interface TranscriptionEngineSummary extends TranscriptionProbe {
  readonly id: string;
  readonly label: string;
  readonly kind: "native" | "custom";
}

export interface TranscriptionStatus {
  readonly available: boolean;
  /** Engine that `start` uses when no engine id is passed. */
  readonly engineId: string | null;
  readonly engines: ReadonlyArray<TranscriptionEngineSummary>;
}

const ERROR_CODES = new Set<string>([
  "permission-denied",
  "unsupported-locale",
  "unsupported-os",
  "unavailable",
  "no-microphone",
  "failed",
]);

/** Parse one helper stdout line; returns null for blank or malformed lines. */
export function parseHelperLine(
  line: string,
): (TranscriptionEvent | ({ type: "probe" } & TranscriptionProbe)) | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const str = (key: string) => (typeof obj[key] === "string" ? (obj[key] as string) : "");
  switch (obj.type) {
    case "ready":
      return {
        type: "ready",
        engine: str("engine"),
        locale: str("locale"),
        onDevice: obj.onDevice === true,
      };
    case "partial":
    case "final":
      return { type: obj.type, text: str("text") };
    case "level":
      return { type: "level", level: Math.max(0, Math.min(1, Number(obj.level) || 0)) };
    case "warning":
      return { type: "warning", code: str("code"), message: str("message") };
    case "error":
      return {
        type: "error",
        code: (ERROR_CODES.has(str("code")) ? str("code") : "failed") as TranscriptionErrorCode,
        message: str("message"),
      };
    case "end":
      return { type: "end" };
    case "probe":
      return {
        type: "probe",
        available: obj.available === true,
        onDevice: obj.onDevice === true,
        ...(str("authorization") ? { authorization: str("authorization") } : {}),
        ...(str("reason") ? { reason: str("reason") } : {}),
        locales: Array.isArray(obj.locales)
          ? obj.locales.filter((l): l is string => typeof l === "string")
          : [],
      };
    default:
      return null;
  }
}

export const TRANSCRIPTION_IPC = {
  status: "t3team:transcription:status",
  start: "t3team:transcription:start",
  stop: "t3team:transcription:stop",
  abort: "t3team:transcription:abort",
  event: "t3team:transcription:event",
} as const;
