import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";

/** Where a save is, in the order `saveProjectRepositories` moves through them. */
export type LinkedRepositorySavePhase =
  | "saving"
  | "waiting-for-main"
  | "switching-main"
  | "scaffolding"
  | "saved";

export type SyncStepState = "pending" | "active" | "done" | "failed";

export type SyncStep = {
  readonly id: string;
  readonly label: string;
  readonly state: SyncStepState;
  readonly detail?: string;
};

const PHASE_ORDER: ReadonlyArray<LinkedRepositorySavePhase> = [
  "saving",
  "waiting-for-main",
  "switching-main",
  "scaffolding",
  "saved",
];

const reached = (phase: LinkedRepositorySavePhase, target: LinkedRepositorySavePhase) =>
  PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target);

function repositoryStep(
  url: string,
  entry: LinkedRepositorySyncResult | undefined,
  saved: boolean,
): SyncStep {
  const label = parseRepositoryLabel(url);
  const id = `repository:${url}`;
  if (!saved || !entry) return { id, label, state: "pending" };
  if (entry.syncState === "cloning") {
    return { id, label, state: "active", detail: "Cloning — a large repository takes a while" };
  }
  if (entry.syncState === "updating") return { id, label, state: "active", detail: "Updating" };
  if (entry.syncState === "queued") return { id, label, state: "pending", detail: "In the queue" };
  if (entry.status === "failed") {
    return { id, label, state: "failed", ...(entry.error ? { detail: entry.error } : {}) };
  }
  // Linked repositories sync on demand: recording one is all a save does for it.
  if (entry.status === "pending" || entry.status === "not-cloned") {
    return { id, label, state: "done", detail: "Linked — cloned when needed" };
  }
  return { id, label, state: "done", detail: "Ready" };
}

/** A failed clone means the steps that build on it (main repository, workspace) did not happen. */
function holdBackAfterFailure(steps: ReadonlyArray<SyncStep>): ReadonlyArray<SyncStep> {
  const firstFailure = steps.findIndex((step) => step.state === "failed");
  if (firstFailure === -1) return steps;
  return steps.map((step, index) =>
    index > firstFailure && !step.id.startsWith("repository:") && step.state === "done"
      ? { ...step, state: "pending" }
      : step,
  );
}

/**
 * The ordered steps a linked-repositories save goes through, with each one's state. The first step
 * that is not `done` is the current one; everything after it is what remains.
 */
export function buildSyncSteps(input: {
  readonly phase: LinkedRepositorySavePhase;
  readonly urls: ReadonlyArray<string>;
  readonly byUrl: ReadonlyMap<string, LinkedRepositorySyncResult>;
  /** The main repository being switched to, when this save changes it. */
  readonly mainRepositoryUrl?: string | null;
}): ReadonlyArray<SyncStep> {
  const { phase } = input;
  const saved = reached(phase, "waiting-for-main");
  const steps: SyncStep[] = [
    { id: "save", label: "Save the repository list", state: saved ? "done" : "active" },
    ...input.urls.map((url) => repositoryStep(url, input.byUrl.get(url), saved)),
  ];
  if (input.mainRepositoryUrl !== undefined) {
    const target =
      input.mainRepositoryUrl === null ? "the project workspace" : input.mainRepositoryUrl;
    steps.push({
      id: "main",
      label: `Make ${input.mainRepositoryUrl === null ? target : parseRepositoryLabel(target)} the main repository`,
      state:
        phase === "switching-main" ? "active" : reached(phase, "scaffolding") ? "done" : "pending",
      ...(phase === "waiting-for-main" ? { detail: "Waiting for its clone to finish" } : {}),
    });
  }
  steps.push({
    id: "workspace",
    label: "Set up the workspace",
    state: phase === "scaffolding" ? "active" : phase === "saved" ? "done" : "pending",
  });
  return holdBackAfterFailure(steps);
}

/** `Step 3 of 7` for the first unfinished step, or null once every step is done. */
export function describeSyncProgress(steps: ReadonlyArray<SyncStep>): string | null {
  const current = steps.findIndex((step) => step.state !== "done");
  return current === -1 ? null : `Step ${current + 1} of ${steps.length}`;
}
