import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createVoicePcmTap, type VoiceStreamBridge } from "./t3team-voicePcmTap";

const config = { model: "", modelPath: "", language: "auto", languages: "de,en", silenceMs: 1500 };

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  readonly close = vi.fn(async () => undefined);
  readonly destination = {};
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createScriptProcessor() {
    return { connect: vi.fn(), onaudioprocess: null as unknown };
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  resume = vi.fn(async () => undefined);
}

function setup() {
  const bridge: VoiceStreamBridge = {
    startVoiceStream: vi.fn(async () => ({ ok: true as const, sessionId: "s1" })),
    pushVoiceStream: vi.fn(async () => undefined),
    stopVoiceStream: vi.fn(async () => ({ text: "the rest", committed: 2 })),
  };
  const sessions: Array<string | null> = [];
  const tap = createVoicePcmTap({
    bridge,
    getConfig: () => config,
    onSession: (id) => sessions.push(id),
  });
  return { bridge, tap, sessions };
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
});
afterEach(() => vi.unstubAllGlobals());

describe("createVoicePcmTap", () => {
  it("keeps the session open when the microphone stops, so the last words can still be written", async () => {
    const { bridge, tap, sessions } = setup();
    await tap.start({} as MediaStream);
    tap.stop();
    expect(FakeAudioContext.instances[0]!.close).toHaveBeenCalledOnce();
    expect(bridge.stopVoiceStream).not.toHaveBeenCalled();
    expect(sessions).toEqual(["s1"]);
  });

  it("finishes the session and returns the text said after the last utterance", async () => {
    const { bridge, tap, sessions } = setup();
    await tap.start({} as MediaStream);
    tap.stop();
    expect(await tap.finish()).toEqual({ text: "the rest", committed: 2 });
    expect(bridge.stopVoiceStream).toHaveBeenCalledWith({ sessionId: "s1", finish: true });
    expect(sessions).toEqual(["s1", null]);
    expect(await tap.finish()).toBeNull();
  });

  it("releases the session even when finishing fails", async () => {
    const { bridge, tap, sessions } = setup();
    vi.mocked(bridge.stopVoiceStream).mockRejectedValueOnce(new Error("ipc gone"));
    await tap.start({} as MediaStream);
    await expect(tap.finish()).rejects.toThrow("ipc gone");
    expect(sessions).toEqual(["s1", null]);
  });

  it("discards without writing anything down, and only once", async () => {
    const { bridge, tap } = setup();
    await tap.start({} as MediaStream);
    tap.discard();
    tap.discard();
    expect(bridge.stopVoiceStream).toHaveBeenCalledExactlyOnceWith({ sessionId: "s1" });
  });

  it("drops a session left over from an earlier recording before starting the next", async () => {
    const { bridge, tap } = setup();
    await tap.start({} as MediaStream);
    await tap.start({} as MediaStream);
    expect(bridge.stopVoiceStream).toHaveBeenCalledExactlyOnceWith({ sessionId: "s1" });
  });
});
