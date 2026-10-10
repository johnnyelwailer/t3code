import { ChevronDownIcon, ChevronRightIcon, LocateFixedIcon, RouteIcon } from "lucide-react";
import { useState } from "react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { ThreadDetailsSection } from "~/components/chat/ThreadDetailsSection";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
} from "~/components/chat/threadDetailsPanelStyles";
import { useT3TeamThreadFacts } from "~/state/t3team-threadSideStreams";
import type { T3TeamActiveWorkflowDockItem } from "~/t3team/chat/t3team-activeWorkflowDock";
import { formatWorkflowStepDue } from "~/t3team/chat/t3team-workflowRunLabels";
import { resolveWorkflowRunStatusPill } from "~/t3team/components/t3team-projectSidebarStatusPills";

/**
 * Thread details panel section: a compact, honest status for the orchestration launched from this
 * thread, next to Automations and Lineage. It mirrors exactly what the user already sees — the
 * sidebar pill's words (one shared dictionary, {@link resolveWorkflowRunStatusPill}) and the
 * composer dock's name/steps — so no surface says more or less than another.
 *
 * It reads the thread's durable `workflowRunStatus` fact (no new server call) and renders nothing
 * until a run exists, so an idle thread shows no section at all. Active runs also carry a dock
 * item (name, live step summaries, the message to scroll to); a recent/terminal run keeps its
 * status fact after the dock drops it, so the card still reports the outcome with a plain name.
 */
export function ThreadOrchestrationPanel({
  environmentId,
  threadId,
  dockItems,
  onLocate,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly dockItems: ReadonlyArray<T3TeamActiveWorkflowDockItem>;
  readonly onLocate?: ((item: T3TeamActiveWorkflowDockItem) => void) | undefined;
}) {
  const facts = useT3TeamThreadFacts(environmentId, threadId);
  const [expanded, setExpanded] = useState(false);
  const run = facts?.workflowRunStatus ?? null;
  const pill = run ? resolveWorkflowRunStatusPill(run) : null;
  // Hide when there is no run to report, or a status with no pill of its own (e.g. `watching`):
  // the section must never appear on an idle thread.
  if (run === null || pill === null) return null;

  const dockItem = run.runId ? dockItems.find((item) => item.runId === run.runId) : undefined;
  const name = dockItem?.name ?? "Orchestration";
  const wake = formatWorkflowStepDue(run.wakeAt ?? undefined);
  const stepSummaries = dockItem?.summaries ?? [];
  const canLocate = dockItem !== undefined && onLocate !== undefined;
  const hasDetail = stepSummaries.length > 0 || wake !== null || canLocate;

  return (
    <ThreadDetailsSection
      headingId="thread-details-orchestration-heading"
      title="Orchestration"
      data-thread-orchestration-panel
    >
      <button
        type="button"
        className={cn(
          "group flex w-full items-center rounded-lg py-1.5",
          THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
          hasDetail && "hover:bg-muted/55",
        )}
        aria-expanded={hasDetail ? expanded : undefined}
        disabled={!hasDetail}
        data-orchestration-status={pill.label}
        onClick={() => hasDetail && setExpanded((value) => !value)}
      >
        <RouteIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground/80">{name}</span>
          <p className={cn("flex items-center gap-1.5 truncate text-2xs", pill.colorClass)}>
            <span className={cn("size-1.5 shrink-0 rounded-full", pill.dotClass)} aria-hidden />
            <span className="shrink-0 font-medium">{pill.label}</span>
            {pill.detail ? (
              <span className="min-w-0 truncate text-muted-foreground">· {pill.detail}</span>
            ) : null}
          </p>
        </div>
        {hasDetail ? (
          expanded ? (
            <ChevronDownIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
          ) : (
            <ChevronRightIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
          )
        ) : null}
      </button>

      {hasDetail && expanded ? (
        <div data-orchestration-detail className="mt-1 flex flex-col gap-1.5 px-2.5 pb-1">
          {stepSummaries.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {stepSummaries.map((summary, index) => (
                <li key={`${summary}-${index}`} className="truncate text-2xs text-muted-foreground">
                  {summary}
                </li>
              ))}
            </ul>
          ) : null}
          {wake !== null ? <p className="text-2xs text-muted-foreground">Wakes {wake}</p> : null}
          {canLocate ? (
            <button
              type="button"
              className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 text-2xs font-medium text-primary hover:bg-muted/55"
              onClick={(event) => {
                event.stopPropagation();
                onLocate(dockItem);
              }}
            >
              <LocateFixedIcon className="size-3 shrink-0" />
              Show in conversation
            </button>
          ) : null}
        </div>
      ) : null}
    </ThreadDetailsSection>
  );
}
