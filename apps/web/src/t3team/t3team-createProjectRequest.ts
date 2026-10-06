import { create } from "zustand";

/**
 * "Open the add-a-Jira-project dialog" as a request, so a surface with no router in reach can
 * still ask for it.
 *
 * The dialog is the `/t3team/new` route. The Add-project entry lives in upstream's command palette,
 * whose item `run` is plain code with no navigate function. Rather than thread one through the
 * palette (an upstream file this fork must not reshape), the palette raises a request and the t3team
 * route surface turns it into a navigation (`useCreateProjectRequestNavigation`).
 *
 * Modelled on {@link ./t3team-activeChatStore.ts}: a tiny zustand store, no provider.
 */
/** A Jira project the dialog should open on, identified by site account AND external id. */
export type T3TeamCreateProjectPreselect = {
  readonly accountId: string;
  readonly externalProjectId: string;
};

type T3TeamCreateProjectRequestState = {
  /** Bumped per request rather than a boolean, so two consecutive asks both register. */
  readonly requestId: number;
  readonly preselect: T3TeamCreateProjectPreselect | null;
  readonly request: (preselect?: T3TeamCreateProjectPreselect) => void;
  /** Acknowledges the request (and its preselect) once it has been turned into a navigation. */
  readonly clear: () => void;
};

export const useT3TeamCreateProjectRequestStore = create<T3TeamCreateProjectRequestState>(
  (set) => ({
    requestId: 0,
    preselect: null,
    request: (preselect) =>
      set((state) => ({ requestId: state.requestId + 1, preselect: preselect ?? null })),
    clear: () => set({ requestId: 0, preselect: null }),
  }),
);

/** Callable from non-React code (a palette item's `run`). */
export function requestT3TeamCreateProject(preselect?: T3TeamCreateProjectPreselect): void {
  useT3TeamCreateProjectRequestStore.getState().request(preselect);
}
