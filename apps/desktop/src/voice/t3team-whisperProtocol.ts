/** One word as whisper timed it. `p` is its probability, when the runtime reports one. */
export type WhisperWord = {
  readonly text: string;
  readonly t0: number;
  readonly t1: number;
  readonly p?: number;
};

export type WhisperLibVariant = "default" | "vulkan";

export type WhisperAcceleration = "gpu" | "cpu";

/** What the host asks of a worker; `id` pairs a request with its response. */
export type WhisperWorkerCall =
  | {
      readonly type: "load";
      readonly modelPath: string;
      readonly variant: WhisperLibVariant;
      /** Silero VAD model (ggml); without one every pass goes straight to whisper. */
      readonly vadModelPath?: string;
    }
  | {
      readonly type: "transcribe";
      readonly pcm16Base64: string;
      readonly language: string;
    }
  | {
      /** Silero over `pcm16Base64`; whisper is not involved and the call does not queue behind it. */
      readonly type: "vad";
      readonly pcm16Base64: string;
    };

/** A stretch Silero heard as speech, in ms from the start of the audio it was given. */
export type SpeechSpan = { readonly startMs: number; readonly endMs: number };

export type WhisperWorkerRequest = WhisperWorkerCall & { readonly id: number };

export type WhisperWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly acceleration: WhisperAcceleration;
      /** ggml's `ggml_vulkan:` init lines, which name the devices this worker could see. */
      readonly vulkanLog: readonly string[];
      /** Whether the VAD model loaded; absent when none was asked for. */
      readonly vad?: boolean;
    }
  | {
      readonly id: number;
      readonly ok: true;
      readonly text: string;
      readonly language?: string;
      /** Word timings in ms from the start of the pass's audio. */
      readonly words?: readonly WhisperWord[];
    }
  | {
      readonly id: number;
      readonly ok: true;
      /** null: no VAD loaded, or it did not answer in time; the caller treats the audio as speech. */
      readonly speech: readonly SpeechSpan[] | null;
    }
  | { readonly id: number; readonly ok: false; readonly message: string };

export function isWhisperWorkerResponse(message: unknown): message is WhisperWorkerResponse {
  return (
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    typeof message.id === "number" &&
    "ok" in message &&
    typeof message.ok === "boolean"
  );
}

/** Response id used when a worker dies with requests still in flight. */
export const WHISPER_WORKER_CRASH_ID = -1;

export const WHISPER_WORKER_READY = "ready";

/** Every line of ggml's Vulkan device listing, including the `Found N Vulkan devices` header. */
export const VULKAN_DEVICE_LISTING_LOG = /^\s*ggml_vulkan: /;

/** Matches ggml's "using Vulkan0 backend"; the CPU backend never logs this line. */
export const GPU_BACKEND_LOG = /whisper_backend_init_gpu: using \S+ backend/;

/** Either outcome of ggml's GPU probe; once seen, the acceleration answer is final. */
export const BACKEND_DECISION_LOG = /whisper_backend_init_gpu: (using \S+ backend|no GPU found)/;
