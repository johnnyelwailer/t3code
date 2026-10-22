import { describe, expect, it } from "vite-plus/test";

import {
  formatVoiceClock,
  IDLE_VOICE_UI,
  reduceVoiceUi,
  voiceUiElapsedMs,
  voiceUiIsLive,
  type VoiceUiAction,
  type VoiceUiSnapshot,
} from "./t3team-voiceUiModel";

type PhaseAction = Extract<VoiceUiAction, { type: "phase" }>;

const phase = (
  next: PhaseAction["phase"],
  now: number,
  extra: Partial<PhaseAction> = {},
): VoiceUiAction => ({
  type: "phase",
  phase: next,
  errorAction: null,
  error: null,
  sessionId: "s1",
  now,
  ...extra,
});

const run = (actions: ReadonlyArray<VoiceUiAction>): VoiceUiSnapshot =>
  actions.reduce(reduceVoiceUi, IDLE_VOICE_UI);

describe("reduceVoiceUi", () => {
  it("starts the timer when recording begins and freezes it when transcribing starts", () => {
    const transcribing = run([phase("recording", 1_000), phase("transcribing", 4_500)]);
    expect(transcribing).toMatchObject({
      state: "transcribing",
      startedAtMs: 1_000,
      endedAtMs: 4_500,
      sessionId: "s1",
    });
    expect(voiceUiElapsedMs(transcribing, 99_999)).toBe(3_500);
  });

  it("keeps the recording's start across repeated recording phases", () => {
    const recording = run([phase("recording", 1_000), phase("recording", 2_000)]);
    expect(recording.startedAtMs).toBe(1_000);
  });

  it("commits the heard text and survives the controller going idle, then settles", () => {
    const committed = run([
      phase("recording", 1_000),
      phase("transcribing", 3_000),
      { type: "commit", text: "open the board", now: 3_400 },
      phase("idle", 3_401),
      { type: "tier", tier: "control" },
    ]);
    expect(committed).toMatchObject({
      state: "committed",
      heardText: "open the board",
      tier: "control",
      startedAtMs: 1_000,
      endedAtMs: 3_000,
    });
    expect(reduceVoiceUi(committed, { type: "settle" })).toEqual(IDLE_VOICE_UI);
  });

  it("keeps recording when an utterance is committed mid-session", () => {
    const heard = run([
      phase("recording", 1_000),
      { type: "commit", text: "open the board", now: 3_400 },
      { type: "tier", tier: "control" },
    ]);
    expect(heard).toMatchObject({
      state: "recording",
      heardText: "open the board",
      tier: "control",
      startedAtMs: 1_000,
      endedAtMs: null,
    });
    const second = reduceVoiceUi(heard, { type: "commit", text: "and the list", now: 6_000 });
    expect(second).toMatchObject({ state: "recording", heardText: "and the list" });
    expect(reduceVoiceUi(second, phase("transcribing", 8_000))).toMatchObject({
      state: "transcribing",
      endedAtMs: 8_000,
    });
  });

  it("commits the tail of a session that was ended while it was still being written", () => {
    expect(
      run([
        phase("recording", 1_000),
        phase("transcribing", 5_000),
        { type: "commit", text: "the rest", now: 7_000 },
      ]),
    ).toMatchObject({ state: "committed", heardText: "the rest", endedAtMs: 5_000 });
  });

  it("ignores a tier that arrives after the heard moment settled", () => {
    expect(reduceVoiceUi(IDLE_VOICE_UI, { type: "tier", tier: "control" })).toEqual(IDLE_VOICE_UI);
  });

  it("returns to idle when a recording is cancelled", () => {
    expect(run([phase("recording", 1_000), phase("idle", 1_500)])).toEqual(IDLE_VOICE_UI);
  });

  it("tells a blocked microphone from a failed recording and keeps either until dismissed", () => {
    const denied = run([
      phase("preparing", 0),
      phase("error", 10, { errorAction: "settings", error: "Microphone access is required." }),
      phase("idle", 11),
    ]);
    expect(denied).toMatchObject({
      state: "denied",
      failureDetail: "Microphone access is required.",
    });
    const failed = run([
      phase("recording", 0),
      phase("transcribing", 5),
      phase("error", 6, { errorAction: "retry", error: "No speech was detected." }),
    ]);
    expect(failed.state).toBe("failed");
    expect(reduceVoiceUi(failed, { type: "dismiss" })).toEqual(IDLE_VOICE_UI);
  });

  it("clears a failure when the next attempt starts", () => {
    const failed = run([phase("error", 6, { errorAction: "retry", error: "x" })]);
    expect(reduceVoiceUi(failed, phase("preparing", 7)).state).toBe("preparing");
  });

  it("carries model download progress into preparing", () => {
    const preparing = run([{ type: "download", percent: 43 }, phase("preparing", 0)]);
    expect(preparing).toMatchObject({ state: "preparing", downloadPercent: 43 });
  });
});

describe("voice clock", () => {
  it("formats minutes and seconds, with tenths on request", () => {
    expect(formatVoiceClock(0)).toBe("0:00");
    expect(formatVoiceClock(65_400)).toBe("1:05");
    expect(formatVoiceClock(65_400, true)).toBe("1:05.4");
    expect(formatVoiceClock(-5)).toBe("0:00");
  });

  it("counts only the live states as worth a floating widget", () => {
    expect(voiceUiIsLive("recording")).toBe(true);
    expect(voiceUiIsLive("committed")).toBe(true);
    expect(voiceUiIsLive("failed")).toBe(false);
    expect(voiceUiIsLive("preparing")).toBe(false);
  });
});
