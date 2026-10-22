// @effect-diagnostics globalDate:off -- The warm-up's duration is logged.
import type { WhisperHost } from "./t3team-whisperHost.ts";

/** What a warm-up is doing: loading the model into a worker, then its first (shader-compiling) pass. */
export type VoiceWarmupStage = "loading" | "preparing-gpu";

/**
 * One shared warm-up at a time: the VAD model first (so the worker loads with it), then the
 * whisper worker and its throwaway pass. Best effort: a failure is logged and surfaces on the
 * first transcription instead. `stage()` is null when no cold warm-up runs.
 */
export function makeVoiceWarmup<Config>(deps: {
  readonly host: WhisperHost;
  readonly ensureVadModel: () => Promise<void>;
  readonly resolveModelPath: (config: Config) => Promise<string | null>;
  readonly log: (message: string) => void;
}) {
  let stage: VoiceWarmupStage | null = null;
  let inFlight: Promise<void> | null = null;

  const warmUp = async (config: Config): Promise<void> => {
    const cold = !deps.host.isReady();
    const startedAt = Date.now();
    if (cold) stage = "loading";
    try {
      await deps.ensureVadModel();
      const modelPath = await deps.resolveModelPath(config);
      if (modelPath === null) return;
      await deps.host
        .warm(modelPath, () => {
          if (cold) stage = "preparing-gpu";
        })
        .catch((error: unknown) => deps.log(`whisper warm-up failed: ${String(error)}`));
      if (cold) deps.log(`whisper warm-up done in ${Date.now() - startedAt} ms`);
    } finally {
      stage = null;
    }
  };

  return {
    warm: (config: Config): Promise<void> => {
      inFlight ??= warmUp(config).finally(() => (inFlight = null));
      return inFlight;
    },
    stage: (): VoiceWarmupStage | null => stage,
  };
}
