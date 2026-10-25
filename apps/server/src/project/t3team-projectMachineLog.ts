import * as Effect from "effect/Effect";

import type { MachineRepositoryLocation } from "./t3team-projectMachineRepositories.ts";
import type { MachineSelection } from "./t3team-projectMachineOwnership.ts";

/**
 * What discovery scanned and which definition it chose, as span attributes and one debug line.
 * Debug, not info: standby and warm-pool reads call discovery on a timer; the create path logs its
 * own outcome at info (`t3team-cloudSessionMachineLog`).
 */
export const logMachineSelection = (
  projectId: string,
  repositories: ReadonlyArray<MachineRepositoryLocation>,
  selection: Pick<MachineSelection<never>, "discovery" | "ignoredRepositories"> & {
    readonly source: { readonly machine: { readonly repository: string } } | null;
  },
) => {
  const attributes = {
    projectId,
    scanned: repositories.map((entry) => `${entry.repository}${entry.local ? "" : " (remote)"}`),
    chosen: selection.source?.machine.repository ?? null,
    ignoredLinked: selection.ignoredRepositories,
    rejected: selection.discovery.rejected.map((entry) => `${entry.repository}:${entry.path}`),
  };
  return Effect.annotateCurrentSpan(attributes).pipe(
    Effect.andThen(Effect.logDebug("Project machine selection", attributes)),
  );
};
