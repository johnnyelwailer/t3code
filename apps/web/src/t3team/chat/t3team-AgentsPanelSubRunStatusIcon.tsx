/**
 * GHE #254: the sub-run status icon — the SAME status language as the parent
 * card (ThreadActivityMorphIcon, sm variant) and the sidebar sub-run rows
 * (t3team-SidebarSubRunRow): the morphing ring while running, a check when
 * done, an alert icon on error, a faded static ring when idle. Previously
 * the sub-run tree rendered a plain colored dot for every state, so a
 * running child looked identical to an idle one.
 *
 * Lives in its own file so t3team-AgentsPanelSubRunTree.tsx stays under the
 * additive guard's 200-LOC ceiling.
 */
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { ThreadActivityMorphIcon } from "~/components/ThreadActivityStatus";
import type { ProjectThread } from "~/t3team/t3team-types";

export function SubRunStatusIcon({ status }: { status: ProjectThread["status"] }) {
  if (status === "running") {
    return (
      <span className="shrink-0 text-sky-600 dark:text-sky-400">
        <ThreadActivityMorphIcon solid={false} size="sm" pulse />
      </span>
    );
  }
  if (status === "completed") {
    return <CircleCheckIcon aria-hidden className="size-3 shrink-0 text-success" />;
  }
  if (status === "error") {
    return <CircleAlertIcon aria-hidden className="size-3 shrink-0 text-destructive" />;
  }
  // GHE #254: idle keeps the SAME ring, faded + static, so every state reads
  // at the ring's size instead of a shrunk dot.
  return (
    <span className="shrink-0 text-muted-foreground/40">
      <ThreadActivityMorphIcon solid={false} size="sm" />
    </span>
  );
}
