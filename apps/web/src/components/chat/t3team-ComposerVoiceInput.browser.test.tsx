import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";
import { ComposerVoiceInput } from "./t3team-ComposerVoiceInput";

class FakeRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  stopped = false;

  start() {}
  stop() {
    this.stopped = true;
  }
  abort() {
    this.stopped = true;
  }
  emitFinal(transcript: string) {
    const results = { 0: { isFinal: true, 0: { transcript, confidence: 1 } }, length: 1 };
    this.onresult?.({ resultIndex: 0, results });
  }
}

class FakeAudioContext {
  state = "running";
  resume = async () => {};
  close = async () => {};
  createMediaStreamSource = () => ({ connect: () => {}, disconnect: () => {} });
  createAnalyser = () => ({ fftSize: 0, getByteTimeDomainData: () => {} });
}

/** Speech recognition and microphone doubles that record every recognizer and mic track opened. */
function speechApis() {
  const recognizers: FakeRecognition[] = [];
  const microphoneTracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
  class RecordedRecognition extends FakeRecognition {
    constructor() {
      super();
      recognizers.push(this);
    }
  }
  const microphone = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockImplementation(async () => {
      const track = { stop: vi.fn() };
      microphoneTracks.push(track);
      return { getTracks: () => [track] } as unknown as MediaStream;
    });
  const recognition = stubGlobal("SpeechRecognition", RecordedRecognition);
  const audio = stubGlobal("AudioContext", FakeAudioContext);
  return {
    recognizers,
    microphoneTracks,
    [Symbol.dispose]() {
      audio[Symbol.dispose]();
      recognition[Symbol.dispose]();
      microphone.mockRestore();
    },
  };
}

function voiceInput(sessionKey: string, onTranscript: (text: string) => void = () => {}) {
  return <ComposerVoiceInput sessionKey={sessionKey} onTranscript={onTranscript} />;
}

function stateOf(container: HTMLElement) {
  return container.querySelector("[data-voice-input]")?.getAttribute("data-state");
}

async function startRecording(container: HTMLElement) {
  const toggle = container.querySelector("button");
  await act(async () => toggle?.click());
}

describe("ComposerVoiceInput across thread switches", () => {
  it("stops the recognizer, frees the microphone and resets the UI when the thread changes", async () => {
    using speech = speechApis();
    const transcripts: string[] = [];
    await using screen = await render(
      voiceInput("thread-a", (text) => transcripts.push(text)),
      { router: false },
    );
    await startRecording(screen.container);
    const recognizer = speech.recognizers[0]!;
    recognizer.emitFinal("hello from thread a");
    expect(stateOf(screen.container)).toBe("recording");

    await screen.rerender(voiceInput("thread-b", (text) => transcripts.push(text)));

    expect(recognizer.stopped).toBe(true);
    expect(speech.microphoneTracks).toHaveLength(1);
    expect(speech.microphoneTracks[0]!.stop).toHaveBeenCalled();
    expect(stateOf(screen.container)).toBe("idle");
    expect(transcripts).toEqual([]);
  });

  it("keeps recording when the thread stays the same", async () => {
    using speech = speechApis();
    await using screen = await render(voiceInput("thread-a"), { router: false });
    await startRecording(screen.container);

    await screen.rerender(voiceInput("thread-a"));

    expect(speech.recognizers[0]!.stopped).toBe(false);
    expect(stateOf(screen.container)).toBe("recording");
  });
});

describe("ComposerVoiceInput single active recording", () => {
  it("starting a second composer ends the first and commits its words to its own draft", async () => {
    using speech = speechApis();
    const firstTranscripts: string[] = [];
    await using first = await render(
      voiceInput("thread-a", (text) => firstTranscripts.push(text)),
      { router: false },
    );
    await using second = await render(voiceInput("thread-b"), { router: false });
    await startRecording(first.container);
    speech.recognizers[0]!.emitFinal("for thread a");

    await startRecording(second.container);

    expect(stateOf(first.container)).toBe("idle");
    expect(stateOf(second.container)).toBe("recording");
    expect(firstTranscripts).toEqual(["for thread a"]);
    expect(speech.microphoneTracks[0]!.stop).toHaveBeenCalled();
    const live = speech.recognizers.filter((recognizer) => !recognizer.stopped);
    expect(live).toEqual([speech.recognizers[1]]);
  });
});
