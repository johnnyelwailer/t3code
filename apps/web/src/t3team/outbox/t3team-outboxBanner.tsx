/**
 * Queued-send banner for a t3team thread: shows the outbox entries waiting on
 * this thread, their delivery state, a resend affordance for permanent
 * failures, and a discard affordance on every row so a stuck head (a deleted
 * card, an entry the user no longer wants) can be cleared instead of parking
 * the whole environment queue. Rendered above the ChatView by ThreadChatViewBody.
 */
import { useEnvironment } from "~/state/environments";
import {
  t3TeamOutboxEntryPreview,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";
import {
  removeT3TeamOutboxEntry,
  retryT3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxStore";

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

/**
 * Returns null for an empty queue. The environment lookup lives in a child
 * that is only mounted when there is at least one entry, so this component
 * itself has a stable (zero) hook count and cannot violate the rules of hooks
 * when the last queued entry is delivered.
 */
export function T3TeamOutboxBanner(props: T3TeamOutboxBannerProps) {
  if (props.entries.length === 0) return null;
  return <OutboxBannerBody {...props} />;
}

function OutboxBannerBody({ entries, dispatchingEntryId, failures }: T3TeamOutboxBannerProps) {
  const environment = useEnvironment(entries[0]!.environmentId as never);
  const label = environment?.label ?? "the environment";
  return (
    <div className="flex flex-col gap-0.5 border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <div key={entry.entryId} className="flex items-center gap-2">
          <span className="shrink-0">{KIND_LABEL[entry.kind]}</span>
          <span className="min-w-0 flex-1 truncate">{t3TeamOutboxEntryPreview(entry)}</span>
          <OutboxEntryStatus
            entry={entry}
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
  readonly entry: T3TeamOutboxEntry;
  readonly dispatching: boolean;
  readonly failure: string | null;
  readonly environmentLabel: string;
}) {
  if (props.dispatching) {
    return <span className="ml-auto shrink-0 text-primary/80">sending…</span>;
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {props.failure !== null ? (
        <>
          <span className="max-w-56 truncate text-destructive">{props.failure}</span>
          <button
            type="button"
            onClick={() => retryT3TeamOutboxEntry(props.entry.entryId)}
            className="underline underline-offset-2 hover:text-destructive/80"
          >
            Resend
          </button>
        </>
      ) : (
        <span className="text-muted-foreground">
          queued · sends when {props.environmentLabel} reconnects
        </span>
      )}
      <button
        type="button"
        onClick={() => removeT3TeamOutboxEntry(props.entry)}
        className="underline underline-offset-2 hover:opacity-70"
        aria-label="Discard queued send"
      >
        Discard
      </button>
    </span>
  );
}
