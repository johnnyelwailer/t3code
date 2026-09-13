/**
 * Queued-send banner for a t3team thread: shows the outbox entries waiting on
 * this thread, their delivery state, and a resend affordance for permanent
 * failures. Rendered above the ChatView by ThreadChatViewBody.
 */
import { useEnvironment } from "~/state/environments";
import {
  t3TeamOutboxEntryPreview,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";
import { retryT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxStore";

const KIND_LABEL: Readonly<Record<T3TeamOutboxEntry["kind"], string>> = {
  "turn-start": "message",
  "workflow-answer": "workflow answer",
  "recipe-card-action": "card action",
  "staged-action": "action",
};

export interface T3TeamOutboxBannerProps {
  readonly entries: ReadonlyArray<T3TeamOutboxEntry>;
  readonly dispatchingEntryId: string | null;
  readonly failures: Readonly<Record<string, string>>;
}

/** One row per queued entry; returns null for an empty queue. */
export function T3TeamOutboxBanner({
  entries,
  dispatchingEntryId,
  failures,
}: T3TeamOutboxBannerProps) {
  if (entries.length === 0) return null;
  const environment = useEnvironment(entries[0]!.environmentId as never);
  const label = environment?.label ?? "the environment";
  return (
    <div className="flex flex-col gap-0.5 border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <div key={entry.entryId} className="flex items-center gap-2">
          <span>{KIND_LABEL[entry.kind]}</span>
          <span className="truncate">{t3TeamOutboxEntryPreview(entry)}</span>
          <OutboxEntryStatus
            entryId={entry.entryId}
            dispatching={dispatchingEntryId === entry.entryId}
            failure={failures[entry.entryId] ?? null}
            environmentLabel={label}
          />
        </div>
      ))}
    </div>
  );
}

function OutboxEntryStatus(props: {
  readonly entryId: string;
  readonly dispatching: boolean;
  readonly failure: string | null;
  readonly environmentLabel: string;
}) {
  if (props.dispatching) {
    return <span className="shrink-0 text-primary/80">sending…</span>;
  }
  if (props.failure !== null) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-2 text-destructive">
        <span className="max-w-56 truncate">{props.failure}</span>
        <button
          type="button"
          onClick={() => retryT3TeamOutboxEntry(props.entryId)}
          className="underline underline-offset-2 hover:text-destructive/80"
        >
          Resend
        </button>
      </span>
    );
  }
  return (
    <span className="ml-auto shrink-0">
      queued · sends when {props.environmentLabel} reconnects
    </span>
  );
}
