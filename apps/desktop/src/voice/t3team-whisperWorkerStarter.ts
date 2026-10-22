import type { WhisperSentinel } from "./t3team-whisperSentinel.ts";
import { startVulkanWorker, type VulkanPinState } from "./t3team-whisperVulkanStart.ts";
import {
  startWhisperWorker,
  type LiveWhisperWorker,
  type WhisperWorkerEnv,
  type WhisperWorkerHandle,
} from "./t3team-whisperWorkerClient.ts";

/**
 * GPU first behind the crash sentinel, on the discrete device when the machine has one; any GPU
 * load failure, or a sentinel that is still blocking, starts the CPU build instead.
 */
export function makeWhisperWorkerStarter(options: {
  readonly spawnWorker: (env?: WhisperWorkerEnv) => WhisperWorkerHandle;
  readonly sentinel: WhisperSentinel;
  readonly log: (message: string) => void;
  readonly onExit: (handle: WhisperWorkerHandle) => void;
}): (modelPath: string) => Promise<LiveWhisperWorker> {
  const pinState: VulkanPinState = {};
  const startWorker = (modelPath: string, variant: "vulkan" | "default", env?: WhisperWorkerEnv) =>
    startWhisperWorker({
      spawnWorker: options.spawnWorker,
      modelPath,
      variant,
      ...(env ? { env } : {}),
      onExit: options.onExit,
    });

  return async (modelPath) => {
    const decision = options.sentinel.evaluate();
    if (decision.blocked) {
      options.log(
        `GPU skipped: ${decision.crashCount} unfinished GPU attempt(s) recorded; CPU until retry`,
      );
    } else {
      options.sentinel.arm();
      try {
        return await startVulkanWorker({
          start: (env) => startWorker(modelPath, "vulkan", env),
          state: pinState,
          log: options.log,
        });
      } catch (error) {
        options.log(`GPU load failed, falling back to CPU: ${String(error)}`);
      }
    }
    return startWorker(modelPath, "default");
  };
}
