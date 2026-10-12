import { MessageSquareTextIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type {
  EnvironmentId,
  ReferenceLinkedThreadsInput,
  ThreadId,
} from "@t3tools/contracts";

import { cn } from "~/lib/utils";

import type { ReferenceThreadRow, ReferenceThreadSection } from "./referenceThreads.logic";
import { useOpenReferenceThread } from "./useOpenReferenceThread";
import { useReferenceThreads } from "./useReferenceThreads";

interface ReferenceThreadsPanelProps {
  readonly environmentId: EnvironmentId;
  readonly input: ReferenceLinkedThreadsInput;
  /** Start with the roster body open. Default true. */
  readonly defaultExpanded?: boolean;
  /** Tighter padding for embedded (in-thread) surfaces. */
  readonly compact?: boolean;
  /** Override row navigation; defaults to the environment's thread route. */
  readonly onOpenThread?: (threadId: ThreadId) => void;
}

/**
 * A read-only roster of the threads related to a work item or pull request, grouped into the main
 * sidebar's shelves. Read-only on purpose: no reordering and no "add to chat" — the roster tells
 * you who is on the reference, it is not a composer.
 */
export function ReferenceThreadsPanel({
  environmentId,
  input,
  defaultExpanded = true,
  compact = false,
  onOpenThread,
}: ReferenceThreadsPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const openThread = onOpenThread ?? useOpenReferenceThread(environmentId);
  const { sections, total, error, isPending, refresh } = useReferenceThreads(environmentId, input);

  return (
    <div className={cn("flex flex-col", compact ? "px-2 py-1.5" : "px-2 py-2")}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <MessageSquareTextIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="shrink-0">Threads</span>
        {total > 0 ? (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/70">{total}</span>
        ) : null}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="space-y-3 pt-1">
          {error !== null ? (
            <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
              <span>Couldn't load threads.</span>
              <button
                type="button"
                onClick={refresh}
                className="shrink-0 rounded px-1.5 py-0.5 text-foreground hover:bg-muted"
              >
                Retry
              </button>
            </div>
          ) : total > 0 ? (
            sections.map((section) => (
              <ReferenceSection
                key={section.key}
                section={section}
                compact={compact}
                onOpenThread={openThread}
              />
            ))
          ) : isPending ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">Loading threads…</div>
          ) : (
            <div className="px-2 py-1 text-xs text-muted-foreground">No related threads.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ReferenceSection({
  section,
  compact,
  onOpenThread,
}: {
  readonly section: ReferenceThreadSection;
  readonly compact: boolean;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground/80 transition-colors hover:text-muted-foreground"
      >
        <span className="shrink-0">{section.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground/50">
          {section.threads.length}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5 pl-1">
          {section.threads.map((row) => (
            <ReferenceRow
              key={row.id}
              row={row}
              compact={compact}
              onOpen={() => onOpenThread(row.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReferenceRow({
  row,
  compact,
  onOpen,
}: {
  readonly row: ReferenceThreadRow;
  readonly compact: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={row.title}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-accent/60",
        compact ? "py-1" : "py-1.5",
      )}
    >
      <span
        className={cn(
          "shrink-0 rounded px-1 py-px text-2xs",
          row.source === "linked"
            ? "bg-info/15 text-info-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {row.source === "linked" ? "Linked" : "Claiming"}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90 group-hover:text-foreground">
        {row.title === "" ? "Untitled thread" : row.title}
      </span>
    </button>
  );
}
