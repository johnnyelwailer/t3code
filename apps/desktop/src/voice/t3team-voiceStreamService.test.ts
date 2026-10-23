import type { DesktopVoiceStreamEvent } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { pcm16FromBase64, pcm16ToBase64 } from "./t3team-voicePcm.ts";
import type { DesktopVoiceService } from "./t3team-voiceService.ts";
import { makeDesktopVoiceStreamService } from "./t3team-voiceStreamService.ts";
import { FRAME_MS, fakeSilero, ROOM, SPEECH, tone } from "./t3team-voiceTestAudio.ts";

const config = { model: "m", modelPath: "", language: "auto", languages: "de,en", silenceMs: 1000 };

function setup(prepared: Awaited<ReturnType<DesktopVoiceService["prepare"]>>) {
  const events: DesktopVoiceStreamEvent[] = [];
  const voice: DesktopVoiceService = {
    prepare: vi.fn(async () => prepared),
    warm: vi.fn(async () => undefined),
    warmupStage: vi.fn(() => null),
    isReady: vi.fn(() => true),
    transcribe: vi.fn(async () => ({
      ok: true as const,
      text: "hi",
      language: "en",
      acceleration: "cpu" as const,
      elapsedMs: 10,
      passMs: 8,
    })),
  };
  let next = 0;
  const service = makeDesktopVoiceStreamService({
    voice,
    emit: (event) => events.push(event),
    newSessionId: () => `s${++next}`,
    detectSpeech: (pcm16Base64) => fakeSilero(pcm16FromBase64(pcm16Base64)),
    log: vi.fn(),
  });
  const push = (sessionId: string, amplitude: number, ms: number) => {
    for (let at = 0; at < ms; at += FRAME_MS) {
      service.push({ sessionId, pcm16Base64: pcm16ToBase64(tone(FRAME_MS, amplitude)) });
    }
  };
  return { service, voice, events, push };
}

const READY = { ok: true as const, modelPath: "/m.bin", modelSource: "setting" as const };

describe("makeDesktopVoiceStreamService", () => {
  it("refuses to start when no model is available and does not warm anything", async () => {
    const failure = { ok: false as const, code: "model-unavailable" as const, message: "no model" };
    const { service, voice } = setup(failure);
    expect(await service.start({ config })).toEqual(failure);
    expect(voice.warm).not.toHaveBeenCalled();
  });

  it("tags events with the session id, warms the model, and ends on stop", async () => {
    const { service, voice, events, push } = setup(READY);
    const started = await service.start({ config });
    expect(started).toEqual({ ok: true, sessionId: "s1" });
    expect(voice.warm).toHaveBeenCalledWith(config);

    push("s1", ROOM, 300);
    expect(events.every((event) => event.sessionId === "s1" && event.type === "level")).toBe(true);

    expect(await service.stop({ sessionId: "s1" })).toEqual({ text: "", committed: 0 });
    const seen = events.length;
    push("s1", ROOM, 300);
    expect(events).toHaveLength(seen);
  });

  it("finishes a session by writing down what was said and returns it", async () => {
    const { service, voice, events, push } = setup(READY);
    await service.start({ config });
    push("s1", ROOM, 600);
    push("s1", SPEECH, 1500);
    expect(await service.stop({ sessionId: "s1", finish: true })).toEqual({
      text: "hi",
      committed: 0,
    });
    expect(voice.transcribe).toHaveBeenCalled();
    const seen = events.length;
    push("s1", SPEECH, 300);
    expect(events).toHaveLength(seen);
    expect(await service.stop({ sessionId: "s1", finish: true })).toEqual({
      text: "",
      committed: 0,
    });
  });

  it("answers a finish for a session that is not active with nothing said", async () => {
    const { service } = setup(READY);
    await service.start({ config });
    expect(await service.stop({ sessionId: "nope", finish: true })).toEqual({
      text: "",
      committed: 0,
    });
  });

  it("ignores chunks for a session that is not the active one", async () => {
    const { service, events, push } = setup(READY);
    await service.start({ config });
    await service.start({ config });
    push("s1", SPEECH, 300);
    expect(events).toEqual([]);
    push("s2", SPEECH, 300);
    expect(events.length).toBeGreaterThan(0);
  });

  it("transcribes partials with the session's config and the language it was told", async () => {
    const { service, voice, push } = setup(READY);
    await service.start({ config });
    push("s1", ROOM, 600);
    push("s1", SPEECH, 2500);
    expect(voice.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ config: { ...config, language: "auto" } }),
    );
  });

  it("tells every partial a pinned language whatever the detection said", async () => {
    const { service, voice, push } = setup(READY);
    await service.start({ config: { ...config, language: "de" } });
    push("s1", ROOM, 600);
    for (let round = 0; round < 3; round += 1) push("s1", SPEECH, 2500);
    const languages = vi
      .mocked(voice.transcribe)
      .mock.calls.map(([input]) => input.config.language);
    expect(languages.length).toBeGreaterThan(0);
    expect(new Set(languages)).toEqual(new Set(["de"]));
  });
});

describe("makeDesktopVoiceStreamService warm-up", () => {
  it("tells the session it is warming on every chunk, then ready exactly once", async () => {
    const { service, voice, events, push } = setup(READY);
    let stage: "loading" | "preparing-gpu" | null = "loading";
    let finishWarm: () => void = () => undefined;
    vi.mocked(voice.warmupStage).mockImplementation(() => stage);
    vi.mocked(voice.warm).mockImplementation(
      () => new Promise<void>((resolve) => (finishWarm = resolve)),
    );
    await service.start({ config });
    push("s1", ROOM, 200);
    stage = "preparing-gpu";
    push("s1", ROOM, 100);
    const warmups = () => events.filter((event) => event.type === "warmup");
    expect(warmups().map((event) => event.type === "warmup" && event.stage)).toEqual([
      "loading",
      "loading",
      "preparing-gpu",
    ]);
    stage = null;
    finishWarm();
    await Promise.resolve();
    await Promise.resolve();
    push("s1", ROOM, 100);
    expect(warmups().at(-1)).toMatchObject({ stage: "ready", percent: 100, sessionId: "s1" });
    expect(
      warmups().filter((event) => event.type === "warmup" && event.stage === "ready"),
    ).toHaveLength(1);
  });

  it("sends no warm-up at all when the model is already warm", async () => {
    const { service, events, push } = setup(READY);
    await service.start({ config });
    push("s1", ROOM, 300);
    await Promise.resolve();
    expect(events.some((event) => event.type === "warmup")).toBe(false);
  });
});
