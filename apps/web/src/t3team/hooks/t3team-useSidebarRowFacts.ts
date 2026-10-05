import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { usePrimarySettings } from "~/hooks/useSettings";
import { useT3TeamListedThreadFacts } from "~/state/t3team-threadSideStreams";
import {
  resolveT3TeamWorkflowRunLiveness,
  type T3TeamWorkflowRunLiveness,
} from "~/t3team/t3team-workflowRunLiveness";

/**
 * What a sidebar row adds from the fork thread facts: the liveness of a workflow run launched
 * from the thread, and the live activity label (GHE #40) when the label setting is on — it
 * replaces the row's "Working" word.
 */
export function useT3TeamSidebarRowFacts(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): {
  readonly liveness: T3TeamWorkflowRunLiveness | null;
  readonly activityLabel: string | null;
} {
  const facts = useT3TeamListedThreadFacts(environmentId, threadId);
  const labelsEnabled = usePrimarySettings((settings) => settings.t3teamActivityLabelsEnabled);
  return {
    liveness: resolveT3TeamWorkflowRunLiveness(facts),
    activityLabel: labelsEnabled ? (facts?.activityLabel ?? null) : null,
  };
}
