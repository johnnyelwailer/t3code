/**
 * "Back to the default arrangement" for a digest scope: clears the layout an agent stored (the
 * arrange-my-work recipe) and re-reads the graph. `undefined` on a server that has no arrangement
 * endpoint, so the view simply offers no reset.
 */
import type { ProjectShellProject } from "@t3tools/project-context";

import { toastManager } from "~/components/ui/toast";
import { useBackend } from "~/t3team/backend/t3team-index";
import { readMyWorkDigestArrangementApi } from "~/t3team/backend/t3team-myworkDigestArrangementApi";
import type { MyWorkDigestScope } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { toDigestProjectEntries } from "./t3team-digestProjectEntries";

export function useDigestArrangementReset(input: {
  readonly scope: MyWorkDigestScope;
  readonly projects: ReadonlyArray<ProjectShellProject>;
  readonly reload: () => void;
}): (() => Promise<void>) | undefined {
  const arrangementApi = readMyWorkDigestArrangementApi(useBackend());
  if (!arrangementApi) return undefined;
  return async () => {
    try {
      await arrangementApi.resetMyWorkDigestArrangement({
        scope: input.scope,
        projects: toDigestProjectEntries(input.projects),
      });
      input.reload();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not go back to the default arrangement.",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
}
