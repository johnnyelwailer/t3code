import { useMemo } from "react";

import {
  type T3TeamKickoffWorkItemRef,
  buildT3TeamKickoffWorkItemRef,
} from "~/t3team/t3team-kickoffWorkItemRef";
import type { T3TeamSidecarRecipeInput } from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * The work item a kickoff surface is targeting, memoized on the primitives that define it so the
 * launch hook's `useMemo` keeps a stable reference (and does not rebuild the sidecar host) while
 * the same work item stays selected.
 */
export function useT3TeamKickoffWorkItemRef(
  recipeInput: T3TeamSidecarRecipeInput,
): T3TeamKickoffWorkItemRef | undefined {
  return useMemo(
    () => buildT3TeamKickoffWorkItemRef(recipeInput),
    [
      recipeInput.resourceKind,
      recipeInput.selectedWorkLabel,
      recipeInput.project.id,
      recipeInput.project.source.provider,
    ],
  );
}
