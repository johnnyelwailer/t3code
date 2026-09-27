/**
 * Timer helpers for the useVoiceInput hook: the silence auto-send watch and
 * the post-auto-send auto-resume. Split out of t3team-useVoiceInput.ts so it
 * stays under the additive guard's 200 non-empty line ceiling.
 */
import type { SilenceAutoStop } from "./t3team-autoSend.ts";
import type { VoiceState } from "./t3team-types.ts";

/** Poll interval for the silence auto-send watch. */
const SILENCE_WATCH_INTERVAL_MS = 250;
/** Delay between an auto-send and the next listening round. */
const AUTO_RESUME_DELAY_MS = 150;

export interface SilenceWatchDeps {
  stateRef: { readonly current: VoiceState };
  levelNowRef: { readonly current: number };
  autoStop: SilenceAutoStop;
  /** True when there is a transcript OR captured audio to commit. */
  hasContent: () => boolean;
  /** Commit + send, then stay in voice mode. */
  onCommit: () => void;
}

/**
 * Start the silence auto-send watch.
 *
 * Runs on a plain interval, NOT on the rAF loop: rAF is throttled or
 * paused when the tab loses focus, and auto-send must keep working even
 * when the user alt-tabs away mid-recording. Returns the interval id.
 */
export function startSilenceWatch(deps: SilenceWatchDeps): number {
  return window.setInterval(() => {
    if (deps.stateRef.current !== "recording") return;
    if (!deps.autoStop.observe(deps.levelNowRef.current, Date.now())) return;
    if (deps.hasContent()) deps.onCommit();
    else deps.autoStop.prime(Date.now());
  }, SILENCE_WATCH_INTERVAL_MS);
}

export interface AutoResumeDeps {
  stateRef: { readonly current: VoiceState };
  autoResumeRef: { current: boolean };
  startRecordingRef: { readonly current: () => void };
}

/**
 * Schedule the auto-resume that follows an auto-send: right after the
 * auto-send, start listening again (new session, new silence clock). Only a
 * manual tap or Esc actually leaves voice mode. The ref pair breaks the
 * callback cycle between stopRecording and startRecording.
 */
export function scheduleAutoResume(deps: AutoResumeDeps): void {
  deps.autoResumeRef.current = true;
  window.setTimeout(() => {
    if (!deps.autoResumeRef.current) return;
    deps.autoResumeRef.current = false;
    if (deps.stateRef.current !== "idle") return;
    deps.startRecordingRef.current();
  }, AUTO_RESUME_DELAY_MS);
}
