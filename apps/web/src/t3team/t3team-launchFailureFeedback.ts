import { toastManager } from "~/components/ui/toast";

/**
 * The one error toast a failed recipe launch shows. The RunToggle's start/stop/retry and every
 * other UI launch entry point (Quick Start card, bundled recipe launch, digest recipe pill) use it,
 * so a launch that fails reads the same wherever it was started.
 */
export function reportRecipeLaunchFailure(title: string, error: unknown, fallback: string): void {
  toastManager.add({
    type: "error",
    title,
    description: error instanceof Error && error.message.length > 0 ? error.message : fallback,
  });
}

/**
 * Surfaces the outcome of a fire-and-forget launch: a rejection and a `false` result (the launch
 * had no backend, no environment or no thread to start on) both show the toast. Never rejects.
 */
export function surfaceRecipeLaunchOutcome(launch: Promise<boolean>): void {
  launch.then(
    (launched) => {
      if (!launched) {
        reportRecipeLaunchFailure(
          "Could not start",
          undefined,
          "The conversation for this recipe could not be created.",
        );
      }
    },
    (error: unknown) => reportRecipeLaunchFailure("Could not start", error, "The launch failed."),
  );
}
