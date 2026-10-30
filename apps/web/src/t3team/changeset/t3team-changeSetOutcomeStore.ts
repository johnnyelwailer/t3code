import { create } from "zustand";

import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";

type Progress = { readonly done: number; readonly total: number };

type ChangeSetOutcomeState = {
  readonly outcomes: ReadonlyMap<string, OperationOutcome>;
  /** Change sets with an apply in flight: a card that remounts mid-run cannot start a second one. */
  readonly running: ReadonlyMap<string, Progress>;
  readonly setOutcome: (outcome: OperationOutcome) => void;
  readonly setRunning: (changeSetId: string, progress: Progress | null) => void;
};

/**
 * This session's per-operation results, outside React so an unmounted card does not lose them. A
 * reload empties it: an operation written but not recorded is `draft` again afterwards (doc 35).
 */
export const useChangeSetOutcomeStore = create<ChangeSetOutcomeState>((set) => ({
  outcomes: new Map(),
  running: new Map(),
  setOutcome: (outcome) =>
    set((state) => ({ outcomes: new Map(state.outcomes).set(outcome.draftId, outcome) })),
  setRunning: (changeSetId, progress) =>
    set((state) => {
      const running = new Map(state.running);
      if (progress) running.set(changeSetId, progress);
      else running.delete(changeSetId);
      return { running };
    }),
}));
