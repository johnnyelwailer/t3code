import {
  DESKTOP_VOICE_SAMPLE_RATE,
  type DesktopBridge,
  type DesktopVoiceConfig,
  type DesktopVoiceStreamStopResult,
} from "@t3tools/contracts";

import { floatToPcm16Base64 } from "./t3team-recordingToPcm";

export type VoiceStreamBridge = Required<
  Pick<DesktopBridge, "startVoiceStream" | "pushVoiceStream" | "stopVoiceStream">
>;

/**
 * Listens to the same microphone stream the recorder keeps and feeds it to the live session. The
 * audio ends with the recorder (`stop`), but the session outlives it until `finish` or `discard`,
 * because speech said after the last committed utterance still has to be written down.
 */
export type VoicePcmTap = {
  readonly start: (stream: MediaStream) => Promise<void>;
  /** The microphone ended: the audio graph closes, the session stays open. */
  readonly stop: () => void;
  /** Ends the session and writes down what was said after the last utterance; null without a session. */
  readonly finish: () => Promise<DesktopVoiceStreamStopResult | null>;
  /** Ends the session and drops whatever was not yet committed. */
  readonly discard: () => void;
};

/** About 128 ms of audio per IPC message at 16 kHz. */
const TAP_BUFFER_SAMPLES = 2048;

/**
 * Feeds the microphone to the desktop's live transcription as 16 kHz mono PCM chunks. The audio
 * context runs at the whisper sample rate, so the browser resamples and nothing is converted here.
 */
export function createVoicePcmTap(input: {
  readonly bridge: VoiceStreamBridge;
  readonly getConfig: () => DesktopVoiceConfig;
  readonly onSession: (sessionId: string | null) => void;
}): VoicePcmTap {
  let context: AudioContext | null = null;
  let sessionId: string | null = null;

  const closeAudio = () => {
    if (context) void context.close();
    context = null;
  };

  const takeSession = (): string | null => {
    const id = sessionId;
    sessionId = null;
    if (id !== null) input.onSession(null);
    return id;
  };

  const discard = () => {
    closeAudio();
    const id = takeSession();
    if (id !== null) void input.bridge.stopVoiceStream({ sessionId: id }).catch(() => undefined);
  };

  return {
    start: async (stream) => {
      discard();
      const started = await input.bridge.startVoiceStream({ config: input.getConfig() });
      if (!started.ok) throw new Error(started.message);
      const id = started.sessionId;
      sessionId = id;
      input.onSession(id);
      context = new AudioContext({ sampleRate: DESKTOP_VOICE_SAMPLE_RATE });
      const processor = context.createScriptProcessor(TAP_BUFFER_SAMPLES, 1, 1);
      processor.onaudioprocess = (event) => {
        const pcm16Base64 = floatToPcm16Base64(event.inputBuffer.getChannelData(0));
        void input.bridge.pushVoiceStream({ sessionId: id, pcm16Base64 }).catch(() => undefined);
      };
      context.createMediaStreamSource(stream).connect(processor);
      processor.connect(context.destination);
      await context.resume();
    },
    stop: closeAudio,
    finish: async () => {
      closeAudio();
      const id = sessionId;
      if (id === null) return null;
      try {
        return await input.bridge.stopVoiceStream({ sessionId: id, finish: true });
      } finally {
        takeSession();
      }
    },
    discard,
  };
}
