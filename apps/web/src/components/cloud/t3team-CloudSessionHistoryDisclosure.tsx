import type { CloudSession } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { CloudSessionRow } from "./t3team-CloudSessionProvisionRow";

/**
 * The collapsed history of finished cloud sessions: up to the cap, newest
 * first, with no per-row action. Rows render in the regular row style minus
 * its action button — the history is there to see what happened, not to act
 * on it (the provider's run log is the place for that).
 */
export function CloudSessionHistoryDisclosure({
  sessions,
  hiddenCount,
}: {
  readonly sessions: readonly CloudSession[];
  /** Terminal sessions beyond the cap, from `splitCloudSessions`. */
  readonly hiddenCount: number;
}) {
  const total = sessions.length + hiddenCount;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground sm:px-4">
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 transition-transform duration-200 group-data-panel-open:rotate-90"
        />
        <span className="text-xs font-medium">History · {total}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="mt-1 space-y-1">
          {sessions.map((session) => (
            // No per-row action in history, so the callback is inert by design.
            <CloudSessionRow
              key={session.sessionId}
              session={session}
              onAction={() => {}}
              showAction={false}
            />
          ))}
          {hiddenCount > 0 ? (
            <p className="px-3 pb-1 text-muted-foreground/80 text-xs sm:px-4">
              {hiddenCount} older sessions hidden
            </p>
          ) : null}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
