import { create } from "zustand";

/**
 * "Open the Jira project wizard" as a request, so a surface that cannot reach the wizard's state
 * can still ask for it.
 *
 * The wizard (`CreateProjectDialog`) is opened from `showCreate` state owned by the t3team shell,
 * while the Add-project entry lives in upstream's command palette — a different tree with no path
 * to that state. Rather than thread a callback through the sidebar and palette (upstream files this
 * fork must not reshape), the palette raises a request and the shell's overlay honours it.
 *
 * Modelled on {@link ./t3team-activeChatStore.ts}: a tiny zustand store, no provider.
 */
type T3TeamCreateProjectRequestState = {
  /** Bumped per request rather than a boolean, so two consecutive asks both register. */
  readonly requestId: number;
  readonly request: () => void;
  readonly clear: () => void;
};

export const useT3TeamCreateProjectRequestStore = create<T3TeamCreateProjectRequestState>(
  (set) => ({
    requestId: 0,
    request: () => set((state) => ({ requestId: state.requestId + 1 })),
    clear: () => set({ requestId: 0 }),
  }),
);

/** Callable from non-React code (a palette item's `run`). */
export function requestT3TeamCreateProject(): void {
  useT3TeamCreateProjectRequestStore.getState().request();
}
