/**
 * Keep or drop the My Work draft overlay. Both re-read the graph so the board matches the store
 * without another agent turn. Absent when the arrangement API is not on this backend.
 */
import type { ProjectShellProject } from "@t3tools/project-context";

import { toastManager } from "~/components/ui/toast";
import { useBackend } from "~/t3team/backend/t3team-index";
import { readMyWorkDigestArrangementApi } from "~/t3team/backend/t3team-myworkDigestArrangementApi";
import type { MyWorkDigestScope } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { toDigestProjectEntries } from "./t3team-digestProjectEntries";

export function useDigestArrangementDraft(input: {
  readonly scope: MyWorkDigestScope;
  readonly projects: ReadonlyArray<ProjectShellProject>;
  readonly reload: () => void;
}):
  | {
      readonly promote: () => Promise<void>;
      readonly discard: () => Promise<void>;
    }
  | undefined {
  const arrangementApi = readMyWorkDigestArrangementApi(useBackend());
  if (!arrangementApi?.promoteMyWorkDigestArrangement) return undefined;
  const body = {
    scope: input.scope,
    projects: toDigestProjectEntries(input.projects),
  };
  const run = (action: () => Promise<unknown>, title: string) => async () => {
    try {
      await action();
      input.reload();
    } catch (error) {
      toastManager.add({
        type: "error",
        title,
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  return {
    promote: run(
      () => arrangementApi.promoteMyWorkDigestArrangement(body),
      "Could not keep this draft arrangement.",
    ),
    discard: run(
      () => arrangementApi.discardMyWorkDigestArrangement(body),
      "Could not discard this draft arrangement.",
    ),
  };
}
