import { create } from "zustand";

import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";

type Progress = { readonly done: number; readonly total: number };

/** Why an operation must not be sent again: its write may have landed (`uncertain`), or did (`unrecorded`). */
export type HoldKind = "uncertain" | "unrecorded";

type ChangeSetOutcomeState = {
  readonly outcomes: ReadonlyMap<string, OperationOutcome>;
  /**
   * Orthogonal to the outcome: set by an uncertain or unrecorded result, cleared only by a verdict
   * that was recorded (applied or dismissed). A later failure, refusal or failed recording keeps it.
   */
  readonly held: ReadonlyMap<string, HoldKind>;
  /** Change sets with an apply in flight: a card that remounts mid-run cannot start a second one. */
  readonly running: ReadonlyMap<string, Progress>;
  readonly setOutcome: (outcome: OperationOutcome) => void;
  readonly setRunning: (changeSetId: string, progress: Progress | null) => void;
  /** Forgets operations whose verdict the server now holds. */
  readonly prune: (draftIds: ReadonlySet<string>) => void;
};

/**
 * This session's per-operation results, outside React so an unmounted card does not lose them. A
 * reload empties it: an operation written but not recorded is `draft` again afterwards (doc 35).
 */
export const useChangeSetOutcomeStore = create<ChangeSetOutcomeState>((set) => ({
  outcomes: new Map(),
  held: new Map(),
  running: new Map(),
  setOutcome: (outcome) =>
    set((state) => {
      const held = new Map(state.held);
      if (outcome.status === "uncertain" || outcome.status === "unrecorded") {
        held.set(outcome.draftId, outcome.status);
      } else if (outcome.status === "applied" || outcome.status === "dismissed") {
        held.delete(outcome.draftId);
      }
      return { outcomes: new Map(state.outcomes).set(outcome.draftId, outcome), held };
    }),
  setRunning: (changeSetId, progress) =>
    set((state) => {
      const running = new Map(state.running);
      if (progress) running.set(changeSetId, progress);
      else running.delete(changeSetId);
      return { running };
    }),
  prune: (draftIds) =>
    set((state) => {
      if (![...draftIds].some((id) => state.outcomes.has(id) || state.held.has(id))) return state;
      const outcomes = new Map(state.outcomes);
      const held = new Map(state.held);
      for (const id of draftIds) {
        outcomes.delete(id);
        held.delete(id);
      }
      return { outcomes, held };
    }),
}));
