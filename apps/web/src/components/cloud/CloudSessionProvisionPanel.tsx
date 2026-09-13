import { type ReactNode, useCallback, useMemo } from "react";

import { cn } from "~/lib/utils";
import { ConnectionStatusDot } from "../ConnectionStatusDot";
import { ITEM_ROW_CLASSNAME, ITEM_ROW_INNER_CLASSNAME } from "../settings/itemRows";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  type CloudSession,
  cloudSessionToneDotClassName,
  cloudSessionTonePingClassName,
  formatDuration,
  isCloudSessionProvisionPending,
  presentCloudSession,
} from "./cloudSessionProvisionPresentation";

/**
 * Session lengths offered in the panel. The provisioning job holds the machine
 * for the chosen span and then stops itself, so this is the only knob that has
 * to exist — everything else (which repo, which branch, which secrets) is
 * already fixed by the workspace pack.
 */
export const CLOUD_SESSION_DURATION_CHOICES = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 4 * 3600, label: "4 hours" },
  { seconds: 8 * 3600, label: "8 hours" },
] as const;

export const DEFAULT_CLOUD_SESSION_DURATION_SECONDS = 4 * 3600;

/**
 * A determinate bar for a session that is still provisioning. Deliberately not
 * a spinner: the timings are predictable enough (~2.5 min) that an indeterminate
 * spinner would understate how much is known.
 */
function CloudSessionProgressBar({ progress }: { readonly progress: number }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full rounded-full bg-warning transition-[width] duration-500 ease-out"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

function CloudSessionRowsSkeleton() {
  return (
    <div className={ITEM_ROW_CLASSNAME}>
      <div className={ITEM_ROW_INNER_CLASSNAME}>
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-3 w-56 rounded-full" />
        </div>
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
}

/**
 * One provisioning attempt. The row never names the provider's concepts — no
 * run ids, no job names — because the user asked for a workspace, not a build.
 */
export function CloudSessionRow({
  session,
  onAction,
  actionPending = false,
}: {
  readonly session: CloudSession;
  readonly onAction: (session: CloudSession) => void;
  readonly actionPending?: boolean;
}) {
  const presentation = presentCloudSession(session);
  const handleAction = useCallback(() => {
    onAction(session);
  }, [onAction, session]);

  return (
    <div className={ITEM_ROW_CLASSNAME}>
      <div className={ITEM_ROW_INNER_CLASSNAME}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-1">
            <ConnectionStatusDot
              dotClassName={cloudSessionToneDotClassName(presentation.tone)}
              pingClassName={cloudSessionTonePingClassName(presentation.tone)}
            />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="truncate font-medium text-sm">{presentation.title}</div>
            <div
              className={cn(
                "truncate text-xs",
                presentation.tone === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {presentation.detail}
            </div>
            {presentation.progress === null ? null : (
              <CloudSessionProgressBar progress={presentation.progress} />
            )}
          </div>
        </div>
        {presentation.actionLabel === null ? null : (
          <Button
            size="sm"
            variant={presentation.tone === "ready" ? "default" : "outline"}
            disabled={actionPending}
            onClick={handleAction}
          >
            {actionPending ? "Working…" : presentation.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The one-click surface: start a Nexi workspace on fleet compute and connect to
 * it when it comes up.
 *
 * Presentational by design. It owns no fetching and no dispatch — the caller
 * supplies the sessions and handles the actions — so the whole lifecycle can be
 * driven from a story without a live fleet, and so the provider wiring stays a
 * separate, replaceable layer.
 */
export function CloudSessionProvisionPanel({
  sessions,
  loading = false,
  createPending = false,
  durationSeconds = DEFAULT_CLOUD_SESSION_DURATION_SECONDS,
  onDurationChange,
  onCreate,
  onSessionAction,
  pendingSessionId = null,
  empty = null,
}: {
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly loading?: boolean;
  readonly createPending?: boolean;
  readonly durationSeconds?: number;
  readonly onDurationChange?: (seconds: number) => void;
  readonly onCreate: (durationSeconds: number) => void;
  readonly onSessionAction: (session: CloudSession) => void;
  /** Session whose action is in flight, so only that row shows a pending state. */
  readonly pendingSessionId?: string | null;
  readonly empty?: ReactNode;
}) {
  const handleCreate = useCallback(() => {
    onCreate(durationSeconds);
  }, [onCreate, durationSeconds]);

  const handleDurationChange = useCallback(
    (value: string | null) => {
      if (value === null) return;
      onDurationChange?.(Number(value));
    },
    [onDurationChange],
  );

  const durationItems = useMemo(
    () =>
      CLOUD_SESSION_DURATION_CHOICES.map((choice) => ({
        value: String(choice.seconds),
        label: choice.label,
      })),
    [],
  );

  const pendingCount = sessions.filter((session) =>
    isCloudSessionProvisionPending(session.phase),
  ).length;

  return (
    <section className="space-y-3">
      <header className="flex flex-col gap-3 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0 space-y-1">
          <h2 className="font-medium text-sm">Cloud sessions</h2>
          <p className="text-muted-foreground text-xs">
            {pendingCount > 0
              ? `${pendingCount} starting · usually ready in about ${formatDuration(155)}`
              : "Run a full Nexi workspace on fleet compute, then connect to it from here."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            modal={false}
            value={String(durationSeconds)}
            onValueChange={handleDurationChange}
            items={durationItems}
          >
            <SelectTrigger size="sm" className="w-28 min-w-0" aria-label="Session length">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {durationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button size="sm" disabled={createPending} onClick={handleCreate}>
            {createPending ? "Starting…" : "New session"}
          </Button>
        </div>
      </header>

      <div className="space-y-1">
        {loading ? (
          <>
            <CloudSessionRowsSkeleton />
            <CloudSessionRowsSkeleton />
          </>
        ) : sessions.length === 0 ? (
          (empty ?? (
            <p className="px-3 py-6 text-center text-muted-foreground text-xs sm:px-4">
              No cloud sessions yet.
            </p>
          ))
        ) : (
          sessions.map((session) => (
            <CloudSessionRow
              key={session.sessionId}
              session={session}
              onAction={onSessionAction}
              actionPending={pendingSessionId === session.sessionId}
            />
          ))
        )}
      </div>
    </section>
  );
}
