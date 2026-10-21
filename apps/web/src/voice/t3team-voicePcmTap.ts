import {
  DESKTOP_VOICE_SAMPLE_RATE,
  type DesktopBridge,
  type DesktopVoiceConfig,
} from "@t3tools/contracts";

import { floatToPcm16Base64 } from "./t3team-recordingToPcm";

export type VoiceStreamBridge = Required<
  Pick<DesktopBridge, "startVoiceStream" | "pushVoiceStream" | "stopVoiceStream">
>;

/** Listens to the same microphone stream the recorder keeps; lives and dies with it. */
export type VoicePcmTap = {
  readonly start: (stream: MediaStream) => Promise<void>;
  readonly stop: () => void;
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

  return {
    start: async (stream) => {
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
    stop: () => {
      if (context) void context.close();
      context = null;
      if (sessionId !== null)
        void input.bridge.stopVoiceStream({ sessionId }).catch(() => undefined);
      sessionId = null;
      input.onSession(null);
    },
  };
}
