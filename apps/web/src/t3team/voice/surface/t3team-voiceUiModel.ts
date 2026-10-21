import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";

import type { VoiceTier } from "../t3team-voiceRouting";

export type VoiceUiState =
  | "idle"
  | "preparing"
  | "recording"
  | "transcribing"
  | "committed"
  | "failed"
  | "denied";

/** What every voice surface (sidebar row, thread surface, floating widget) renders. */
export interface VoiceUiSnapshot {
  readonly state: VoiceUiState;
  readonly sessionId: string | null;
  /** Epoch ms the recording began. */
  readonly startedAtMs: number | null;
  /** Epoch ms the recording stopped; freezes the timer. */
  readonly endedAtMs: number | null;
  readonly heardText: string | null;
  readonly tier: VoiceTier | null;
  readonly downloadPercent: number | null;
  readonly failureDetail: string | null;
}

export const IDLE_VOICE_UI: VoiceUiSnapshot = {
  state: "idle",
  sessionId: null,
  startedAtMs: null,
  endedAtMs: null,
  heardText: null,
  tier: null,
  downloadPercent: null,
  failureDetail: null,
};

/** How long "Heard" stays before every surface settles back to idle. */
export const VOICE_COMMITTED_SETTLE_MS = 2200;

export type VoiceUiAction =
  | {
      readonly type: "phase";
      readonly phase: VoiceInputPhase;
      readonly errorAction: "retry" | "settings" | null;
      readonly error: string | null;
      readonly sessionId: string | null;
      readonly now: number;
    }
  | { readonly type: "download"; readonly percent: number | null }
  | { readonly type: "commit"; readonly text: string; readonly now: number }
  | { readonly type: "tier"; readonly tier: VoiceTier }
  | { readonly type: "fail"; readonly detail: string | null }
  | { readonly type: "settle" }
  | { readonly type: "dismiss" };

/** States that outlive the controller going idle: they end by settling, dismissal or a new attempt. */
const RESTING_STATES: ReadonlySet<VoiceUiState> = new Set(["committed", "failed", "denied"]);

function reducePhase(
  snapshot: VoiceUiSnapshot,
  action: Extract<VoiceUiAction, { type: "phase" }>,
): VoiceUiSnapshot {
  switch (action.phase) {
    case "preparing":
      return { ...IDLE_VOICE_UI, state: "preparing", downloadPercent: snapshot.downloadPercent };
    case "recording":
      return snapshot.state === "recording"
        ? { ...snapshot, sessionId: action.sessionId ?? snapshot.sessionId }
        : {
            ...IDLE_VOICE_UI,
            state: "recording",
            sessionId: action.sessionId,
            startedAtMs: action.now,
          };
    case "transcribing":
      return { ...snapshot, state: "transcribing", endedAtMs: snapshot.endedAtMs ?? action.now };
    case "error":
      return {
        ...snapshot,
        state: action.errorAction === "settings" ? "denied" : "failed",
        endedAtMs: snapshot.endedAtMs ?? action.now,
        failureDetail: action.error,
      };
    case "idle":
      return RESTING_STATES.has(snapshot.state) ? snapshot : IDLE_VOICE_UI;
  }
}

/** The one place a controller phase, a commit, or a settle turns into what the surfaces show. */
export function reduceVoiceUi(snapshot: VoiceUiSnapshot, action: VoiceUiAction): VoiceUiSnapshot {
  switch (action.type) {
    case "phase":
      return reducePhase(snapshot, action);
    case "download":
      return { ...snapshot, downloadPercent: action.percent };
    case "commit":
      return {
        ...snapshot,
        state: "committed",
        heardText: action.text,
        endedAtMs: snapshot.endedAtMs ?? action.now,
      };
    case "tier":
      return snapshot.state === "committed" ? { ...snapshot, tier: action.tier } : snapshot;
    case "fail":
      return { ...snapshot, state: "failed", failureDetail: action.detail };
    case "settle":
      return snapshot.state === "committed" ? IDLE_VOICE_UI : snapshot;
    case "dismiss":
      return RESTING_STATES.has(snapshot.state) ? IDLE_VOICE_UI : snapshot;
  }
}

/** Whether a surface outside the thread (the floating widget) has anything to say. */
export function voiceUiIsLive(
  state: VoiceUiState,
): state is "recording" | "transcribing" | "committed" {
  return state === "recording" || state === "transcribing" || state === "committed";
}

export function voiceUiElapsedMs(snapshot: VoiceUiSnapshot, now: number): number {
  if (snapshot.startedAtMs === null) return 0;
  return Math.max(0, (snapshot.endedAtMs ?? now) - snapshot.startedAtMs);
}

/** `m:ss`, or `m:ss.t` with tenths. */
export function formatVoiceClock(ms: number, tenths = false): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = String(Math.floor(total % 60)).padStart(2, "0");
  const clock = `${minutes}:${seconds}`;
  return tenths ? `${clock}.${Math.floor((total % 1) * 10)}` : clock;
}
