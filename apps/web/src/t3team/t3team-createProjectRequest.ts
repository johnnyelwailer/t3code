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
/** A Jira project the wizard should land on, identified by site account AND external id. */
export type T3TeamCreateProjectPreselect = {
  readonly accountId: string;
  readonly externalProjectId: string;
};

type T3TeamCreateProjectRequestState = {
  /** Bumped per request rather than a boolean, so two consecutive asks both register. */
  readonly requestId: number;
  /** Outlives `clear` (which only acknowledges the open); the wizard consumes it once applied. */
  readonly preselect: T3TeamCreateProjectPreselect | null;
  readonly request: (preselect?: T3TeamCreateProjectPreselect) => void;
  readonly clear: () => void;
  readonly consumePreselect: () => void;
};

export const useT3TeamCreateProjectRequestStore = create<T3TeamCreateProjectRequestState>(
  (set) => ({
    requestId: 0,
    preselect: null,
    request: (preselect) =>
      set((state) => ({ requestId: state.requestId + 1, preselect: preselect ?? null })),
    clear: () => set({ requestId: 0 }),
    consumePreselect: () => set({ preselect: null }),
  }),
);

/** Callable from non-React code (a palette item's `run`). */
export function requestT3TeamCreateProject(preselect?: T3TeamCreateProjectPreselect): void {
  useT3TeamCreateProjectRequestStore.getState().request(preselect);
}
