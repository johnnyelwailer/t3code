/**
 * The t3team outbox rendered on the NATIVE queued-message surface: one
 * dashed bubble row per entry, at the bottom of the timeline directly after
 * the native queued messages (via ChatView's `queuedExtensions`). This
 * replaces the top-header outbox banner so waiting sends share a single
 * queue surface. The queue itself (durable storage, FIFO drain, retry,
 * dedupe) still lives in `~/t3team/outbox/`.
 *
 * `t3TeamOutboxTimelineExtensions` is a plain (hook-free) mapping so the
 * thread view can build the rows from its existing outbox subscription;
 * only `OutboxEntryRow` hooks, and it is a component in the tree.
 */
import type { ReactNode } from "react";
import { ClockIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useEnvironment } from "~/state/environments";
import {
  t3TeamOutboxEntryPreview,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";
import {
  removeT3TeamOutboxEntry,
  retryT3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxStore";

export interface T3TeamOutboxTimelineExtension {
  readonly id: string;
  readonly node: ReactNode;
}

/** Stable array so an empty outbox does not bust the timeline's row memo. */
export const EMPTY_T3TEAM_OUTBOX_TIMELINE_EXTENSIONS: ReadonlyArray<T3TeamOutboxTimelineExtension> =
  [];

/** Same kind words as the native UI: "message" for a plain turn start. */
const KIND_LABEL: Readonly<Record<T3TeamOutboxEntry["kind"], string>> = {
  "turn-start": "message",
  "workflow-answer": "workflow answer",
  "recipe-card-action": "card action",
  "staged-action": "action",
};

export function t3TeamOutboxTimelineExtensions(
  entries: ReadonlyArray<T3TeamOutboxEntry>,
  dispatchingEntryId: string | null,
  failures: Readonly<Record<string, string>>,
): ReadonlyArray<T3TeamOutboxTimelineExtension> {
  if (entries.length === 0) return EMPTY_T3TEAM_OUTBOX_TIMELINE_EXTENSIONS;
  return entries.map((entry) => ({
    id: `t3team-outbox:${entry.entryId}`,
    node: (
      <OutboxEntryRow
        key={entry.entryId}
        entry={entry}
        dispatching={dispatchingEntryId === entry.entryId}
        failure={failures[entry.entryId] ?? null}
      />
    ),
  }));
}

/**
 * One outbox entry as a dashed queued bubble — the same shape and placement
 * as a native queued message. Delivery state goes in the status chip; a
 * permanent failure adds Resend; every row keeps Discard so a stuck head
 * (a deleted card, an entry the user no longer wants) cannot park the queue.
 */
function OutboxEntryRow(props: {
  readonly entry: T3TeamOutboxEntry;
  readonly dispatching: boolean;
  readonly failure: string | null;
}) {
  const environment = useEnvironment(props.entry.environmentId as never);
  const environmentLabel = environment?.label ?? "the environment";
  const statusLabel = props.dispatching
    ? "Sending"
    : props.failure !== null
      ? `Failed: ${props.failure}`
      : `Sends when ${environmentLabel} reconnects`;
  return (
    <div className="flex flex-col items-end" data-queued-outbox-entry={props.entry.entryId}>
      <div className="max-w-[80%] rounded-2xl border border-dashed border-border p-3 text-message-foreground/80">
        <div className="whitespace-pre-wrap break-words text-sm">
          {t3TeamOutboxEntryPreview(props.entry)}
        </div>
        <div className="mt-2 flex items-center gap-4 text-secondary-label text-xs">
          <span
            className={
              props.failure !== null
                ? "inline-flex max-w-[60%] items-center gap-1 truncate text-destructive"
                : "inline-flex items-center gap-1"
            }
          >
            <ClockIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {KIND_LABEL[props.entry.kind]} · {statusLabel}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            {props.failure !== null ? (
              <button
                type="button"
                onClick={() => retryT3TeamOutboxEntry(props.entry.entryId)}
                className="mr-1 underline underline-offset-2 hover:text-destructive/80"
              >
                Resend
              </button>
            ) : null}
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              className="size-6"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => removeT3TeamOutboxEntry(props.entry)}
              aria-label="Discard queued send"
            >
              <XIcon className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
