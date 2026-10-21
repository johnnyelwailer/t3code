export type WhisperLibVariant = "default" | "vulkan";

/** What the host asks of a worker; `id` pairs a request with its response. */
export type WhisperWorkerCall =
  | {
      readonly type: "load";
      readonly modelPath: string;
      readonly variant: WhisperLibVariant;
    }
  | {
      readonly type: "transcribe";
      readonly pcm16Base64: string;
      readonly language: string;
    };

export type WhisperWorkerRequest = WhisperWorkerCall & { readonly id: number };

export type WhisperWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly acceleration: "gpu" | "cpu" }
  | {
      readonly id: number;
      readonly ok: true;
      readonly text: string;
      readonly language?: string;
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

/** Matches ggml's "using Vulkan0 backend"; the CPU backend never logs this line. */
export const GPU_BACKEND_LOG = /whisper_backend_init_gpu: using \S+ backend/;

/** Either outcome of ggml's GPU probe; once seen, the acceleration answer is final. */
export const BACKEND_DECISION_LOG = /whisper_backend_init_gpu: (using \S+ backend|no GPU found)/;
