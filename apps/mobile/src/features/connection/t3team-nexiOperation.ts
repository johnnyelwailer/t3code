/**
 * Runs one Nexi host operation at a time. A newer operation, `cancel`, or `abort` aborts the running one;
 * an aborted operation never touches the UI state again, so `cancel` must reset it itself.
 */
export function createNexiOperationRunner(ui: {
  setBusy: (busy: boolean) => void;
  setError: (message: string | null) => void;
  clearCode: () => void;
}) {
  let current: AbortController | null = null;
  return {
    run: (action: (signal: AbortSignal) => Promise<void>) => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      ui.setBusy(true);
      ui.setError(null);
      void action(controller.signal)
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            ui.setError(cause instanceof Error ? cause.message : "Could not connect to Nexplore.");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            ui.setBusy(false);
            ui.clearCode();
          }
        });
    },
    /** Aborts the running operation and returns the UI to idle. */
    cancel: () => {
      current?.abort();
      ui.clearCode();
      ui.setBusy(false);
    },
    /** Aborts without touching the UI, for unmounts. */
    abort: () => current?.abort(),
  };
}
