import { ChevronLeftIcon, ChevronRightIcon, LocateFixedIcon, RouteIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import type { ChatMessage } from "~/types";
import { getT3TeamWorkflowShapeAttachment } from "~/t3team/chat/t3team-messageShapeCard";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

export interface T3TeamActiveWorkflowDockItem {
  readonly runId: string;
  readonly messageId: ChatMessage["id"];
  readonly name: string;
  readonly summaries: ReadonlyArray<string>;
}

const TERMINAL_PHASES = new Set(["completed", "failed", "cancelled"]);

function fallbackStepLabel(stepKind: string): string {
  if (stepKind === "thread.turn") return "agent";
  if (stepKind === "user.input") return "your answer";
  if (stepKind === "wait.until") return "scheduled time";
  return stepKind.replaceAll(/[._-]+/g, " ");
}

function summarizeStep(step: T3TeamWorkflowRunProgress["steps"][number]): string {
  const detail = step.detail?.trim() || fallbackStepLabel(step.stepKind);
  if (step.phase === "waiting") return `Waiting: ${detail}`;
  if (step.phase === "paused") return `Paused: ${detail}`;
  return `Active: ${detail}`;
}

/** Build dock rows from launched workflow cards and live run journals. */
export function deriveT3TeamActiveWorkflowDockItems(
  timelineEntries: ReadonlyArray<{
    readonly kind: string;
    readonly message?: ChatMessage;
  }>,
  workflowStepRuns: ReadonlyMap<string, T3TeamWorkflowRunProgress>,
  workflowRunStatus?: OrchestrationWorkflowRunStatus,
): ReadonlyArray<T3TeamActiveWorkflowDockItem> {
  const byRunId = new Map<string, T3TeamActiveWorkflowDockItem>();

  for (const entry of timelineEntries) {
    if (entry.kind !== "message") continue;
    const message = entry.message;
    if (!message) continue;
    const shape = getT3TeamWorkflowShapeAttachment(message);
    const runId = shape?.workflowRunId;
    if (!shape || !runId) continue;

    const progress = workflowStepRuns.get(runId);
    const matchingStatus =
      workflowRunStatus?.runId === runId ? workflowRunStatus.status : undefined;
    const terminal =
      (progress?.run !== null &&
        progress?.run !== undefined &&
        TERMINAL_PHASES.has(progress.run.phase)) ||
      (matchingStatus !== undefined && TERMINAL_PHASES.has(matchingStatus));

    // A shape without journal activity is only active when durable run state confirms it.
    if (terminal || (progress === undefined && matchingStatus === undefined)) continue;

    const summaries = (progress?.steps ?? [])
      .filter(
        (step) => step.phase === "started" || step.phase === "waiting" || step.phase === "paused",
      )
      .map(summarizeStep);

    if (summaries.length === 0) {
      if (matchingStatus === "queued") summaries.push("Waiting to start");
      else if (matchingStatus === "sleeping") summaries.push("Waiting: scheduled time");
      else if (matchingStatus === "paused" || progress?.run?.phase === "paused") {
        summaries.push("Paused");
      } else {
        summaries.push("Running");
      }
    }

    byRunId.set(runId, {
      runId,
      messageId: message.id,
      name: shape.name || "Orchestration",
      summaries,
    });
  }

  return [...byRunId.values()];
}

export function T3TeamActiveWorkflowDock({
  items,
  className,
  onOpen,
}: {
  items: ReadonlyArray<T3TeamActiveWorkflowDockItem>;
  className?: string;
  onOpen: (item: T3TeamActiveWorkflowDockItem) => void;
}) {
  const itemKey = useMemo(() => items.map((item) => item.runId).join("\u0000"), [items]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(items[0]?.runId ?? null);

  useEffect(() => {
    if (selectedRunId !== null && items.some((item) => item.runId === selectedRunId)) return;
    setSelectedRunId(items[0]?.runId ?? null);
  }, [itemKey, items, selectedRunId]);

  if (items.length === 0) return null;

  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.runId === selectedRunId),
  );
  const selected = items[selectedIndex] ?? items[0]!;
  const summary =
    selected.summaries.length > 2
      ? `${selected.summaries.slice(0, 2).join(" · ")} · +${selected.summaries.length - 2}`
      : selected.summaries.join(" · ");
  const selectOffset = (offset: number) => {
    const nextIndex = (selectedIndex + offset + items.length) % items.length;
    setSelectedRunId(items[nextIndex]!.runId);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-x border-t border-border/60 bg-card/95 px-2 py-1.5 text-xs shadow-sm",
        className,
      )}
      data-t3team-active-workflow-dock="true"
    >
      <RouteIcon className="size-3.5 shrink-0 text-primary" />
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/65"
        title={`Show ${selected.name} in conversation`}
        onClick={() => onOpen(selected)}
      >
        <span className="shrink-0 font-medium text-foreground">{selected.name}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
        <LocateFixedIcon className="size-3 shrink-0 text-muted-foreground" />
      </button>
      {items.length > 1 ? (
        <div className="flex shrink-0 items-center gap-0.5" aria-label="Switch orchestration">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Previous active orchestration"
            onClick={() => selectOffset(-1)}
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
          <span className="min-w-7 text-center tabular-nums text-muted-foreground">
            {selectedIndex + 1}/{items.length}
          </span>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Next active orchestration"
            onClick={() => selectOffset(1)}
          >
            <ChevronRightIcon className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
