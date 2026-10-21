import {
  WHISPER_WORKER_CRASH_ID,
  WHISPER_WORKER_READY,
  isWhisperWorkerResponse,
  type WhisperLibVariant,
  type WhisperWorkerCall,
  type WhisperWorkerRequest,
  type WhisperWorkerResponse,
} from "./t3team-whisperProtocol.ts";

export type WhisperWorkerHandle = {
  readonly send: (request: WhisperWorkerRequest) => void;
  readonly onMessage: (listener: (message: unknown) => void) => void;
  readonly onExit: (listener: (detail: string) => void) => void;
  readonly kill: () => void;
};

export type LiveWhisperWorker = {
  readonly handle: WhisperWorkerHandle;
  readonly modelPath: string;
  readonly acceleration: "gpu" | "cpu";
  readonly call: (request: WhisperWorkerCall) => Promise<WhisperWorkerResponse>;
};

/**
 * Spawns one worker and loads the model into it. Resolves once the model is loaded; rejects if the
 * worker fails to load or dies first. `onExit` fires for any later exit (crash or kill).
 */
export function startWhisperWorker(input: {
  readonly spawnWorker: () => WhisperWorkerHandle;
  readonly modelPath: string;
  readonly variant: WhisperLibVariant;
  readonly onExit: (handle: WhisperWorkerHandle) => void;
}): Promise<LiveWhisperWorker> {
  return new Promise((resolve, reject) => {
    const handle = input.spawnWorker();
    const pending = new Map<number, (response: WhisperWorkerResponse) => void>();
    let nextId = 0;
    let ready = false;

    const call: LiveWhisperWorker["call"] = (request) =>
      new Promise((settle) => {
        const id = ++nextId;
        pending.set(id, settle);
        handle.send({ ...request, id });
      });

    handle.onMessage((message) => {
      if (message === WHISPER_WORKER_READY) {
        ready = true;
        void call({ type: "load", modelPath: input.modelPath, variant: input.variant }).then(
          (response) => {
            if (!response.ok) return reject(new Error(response.message));
            resolve({
              handle,
              call,
              modelPath: input.modelPath,
              acceleration: "acceleration" in response ? response.acceleration : "cpu",
            });
          },
        );
        return;
      }
      if (!isWhisperWorkerResponse(message)) return;
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    });

    handle.onExit((detail) => {
      const message = `whisper worker exited (${detail})`;
      for (const settle of pending.values()) {
        settle({ id: WHISPER_WORKER_CRASH_ID, ok: false, message });
      }
      pending.clear();
      input.onExit(handle);
      if (!ready) reject(new Error(message));
    });
  });
}
