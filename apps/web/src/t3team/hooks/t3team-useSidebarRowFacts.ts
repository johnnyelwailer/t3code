import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { resolveLiveStateSidebarOverride } from "~/cloud/t3team-environmentLiveState";
import { useEnvironmentLiveState } from "~/cloud/t3team-useEnvironmentLiveState";
import { useActivityLabelsEnabled } from "~/t3team/t3team-useActivityLabelsEnabled";
import { useT3TeamListedThreadFacts } from "~/state/t3team-threadSideStreams";
import {
  resolveT3TeamWorkflowRunLiveness,
  type T3TeamWorkflowRunLiveness,
} from "~/t3team/t3team-workflowRunLiveness";

/**
 * What a sidebar row adds from the fork thread facts: the liveness of a workflow run launched
 * from the thread, and the live activity label (GHE #40) when the label setting is on — it
 * replaces the row's "Working" word. A row of an environment that is offline (or whose cloud
 * session ended) must not claim it is working: its word and colour are replaced, and `frozen`
 * stops the duration counter. All three only matter to a row whose status is "working".
 */
export function useT3TeamSidebarRowFacts(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): {
  readonly liveness: T3TeamWorkflowRunLiveness | null;
  readonly activityLabel: string | null;
  readonly frozen: boolean;
  readonly statusClassName: string | null;
} {
  const facts = useT3TeamListedThreadFacts(environmentId, threadId);
  const labelsEnabled = useActivityLabelsEnabled();
  const stale = resolveLiveStateSidebarOverride(useEnvironmentLiveState(environmentId));
  return {
    liveness: resolveT3TeamWorkflowRunLiveness(facts),
    activityLabel: stale?.label ?? (labelsEnabled ? (facts?.activityLabel ?? null) : null),
    frozen: stale !== null,
    statusClassName: stale?.className ?? null,
  };
}
