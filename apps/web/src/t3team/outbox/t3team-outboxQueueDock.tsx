/**
 * The t3team offline outbox on the composer's queue dock, next to the native server queue
 * (`QueuedRunsControl`): sends made while the environment was unreachable wait here and leave
 * when it reconnects. One queue surface, one place. The queue itself (durable storage, FIFO drain,
 * retry, dedupe) lives in `~/t3team/outbox/`.
 */
import { ClockIcon } from "lucide-react";

import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { useEnvironment } from "~/state/environments";
import {
  t3TeamOutboxEntryPreview,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";
import {
  removeT3TeamOutboxEntry,
  retryT3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxStore";

/** Same kind words as the native UI: "message" for a plain turn start. */
const KIND_LABEL: Readonly<Record<T3TeamOutboxEntry["kind"], string>> = {
  "turn-start": "message",
  "workflow-answer": "workflow answer",
  "recipe-card-action": "card action",
  "staged-action": "action",
};

export function T3TeamOutboxQueueDock(props: {
  readonly entries: ReadonlyArray<T3TeamOutboxEntry>;
  readonly dispatchingEntryId: string | null;
  readonly failures: Readonly<Record<string, string>>;
}) {
  if (props.entries.length === 0) return null;
  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root
        role="region"
        aria-label={`${props.entries.length} send${props.entries.length === 1 ? "" : "s"} waiting to reconnect`}
        aria-live="polite"
        data-t3team-outbox-dock="true"
      >
        <ComposerBanner.Children render={<ol />}>
          {props.entries.map((entry) => (
            <OutboxEntryRow
              key={entry.entryId}
              entry={entry}
              dispatching={props.dispatchingEntryId === entry.entryId}
              failure={props.failures[entry.entryId] ?? null}
            />
          ))}
        </ComposerBanner.Children>
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}

/**
 * One outbox entry. Delivery state goes in the status line; a permanent failure adds Resend;
 * every row keeps Discard so a stuck head (a deleted card, an entry the user no longer wants)
 * cannot park the queue.
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
    <ComposerBanner.Row render={<li />} data-queued-outbox-entry={props.entry.entryId}>
      <ComposerBanner.Icon>
        <ClockIcon />
      </ComposerBanner.Icon>
      <ComposerBanner.Content className="flex min-w-0 flex-col">
        <span className="truncate text-foreground/80">{t3TeamOutboxEntryPreview(props.entry)}</span>
        <span
          className={
            props.failure !== null ? "truncate text-destructive" : "truncate text-muted-foreground"
          }
        >
          {KIND_LABEL[props.entry.kind]} · {statusLabel}
        </span>
      </ComposerBanner.Content>
      <ComposerBanner.Actions>
        {props.failure !== null ? (
          <button
            type="button"
            onClick={() => retryT3TeamOutboxEntry(props.entry.entryId)}
            className="underline underline-offset-2 hover:text-destructive/80"
          >
            Resend
          </button>
        ) : null}
        <ComposerBanner.Dismiss
          aria-label="Discard queued send"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => removeT3TeamOutboxEntry(props.entry)}
        />
      </ComposerBanner.Actions>
    </ComposerBanner.Row>
  );
}
