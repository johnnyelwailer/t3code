/**
 * Moments when a pending (debounced) composer-draft write must hit storage now.
 *
 * `beforeunload` alone is not enough: Electron's `BrowserWindow.destroy()` (used
 * on app quit) and a killed renderer never fire it, so the last ~300 ms of typing
 * were lost. `pagehide`, a hidden tab/window and window blur are the last
 * reliable signals before the app may go away, so they flush too.
 */
export const COMPOSER_DRAFT_FLUSH_WINDOW_EVENTS = ["beforeunload", "pagehide", "blur"] as const;

type FlushEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;
type VisibilityTarget = Pick<Document, "addEventListener" | "removeEventListener"> & {
  readonly visibilityState: DocumentVisibilityState;
};

/** Installs the flush triggers; returns a disposer (used by tests). */
export function installComposerDraftFlushTriggers(
  flush: () => void,
  targets: {
    readonly window: FlushEventTarget | undefined;
    readonly document: VisibilityTarget | undefined;
  },
): () => void {
  const disposers: Array<() => void> = [];
  const win = targets.window;
  if (win && typeof win.addEventListener === "function") {
    for (const eventName of COMPOSER_DRAFT_FLUSH_WINDOW_EVENTS) {
      win.addEventListener(eventName, flush);
      disposers.push(() => win.removeEventListener(eventName, flush));
    }
  }
  const doc = targets.document;
  if (doc && typeof doc.addEventListener === "function") {
    const onVisibilityChange = () => {
      if (doc.visibilityState === "hidden") flush();
    };
    doc.addEventListener("visibilitychange", onVisibilityChange);
    disposers.push(() => doc.removeEventListener("visibilitychange", onVisibilityChange));
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/**
 * New-thread drafts (keyed by a `DraftId` string, no server thread yet) exist
 * nowhere but local storage, so their prompt is written through immediately
 * instead of waiting for the debounce. Existing-thread drafts keep the debounce.
 */
export function shouldWriteThroughComposerDraft(target: unknown): boolean {
  return typeof target === "string" && target.trim().length > 0;
}
