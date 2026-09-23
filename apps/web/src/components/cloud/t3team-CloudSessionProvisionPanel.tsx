import type { CloudSession } from "@t3tools/contracts";
import { type ReactNode, useCallback, useMemo } from "react";

import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { CloudSessionHistoryDisclosure } from "./t3team-CloudSessionHistoryDisclosure";
import { CloudSessionRow, CloudSessionRowsSkeleton } from "./t3team-CloudSessionProvisionRow";
import {
  formatDuration,
  isCloudSessionProvisionPending,
} from "./t3team-cloudSessionProvisionPresentation";
import { splitCloudSessions } from "./t3team-cloudSessionSplit";

/**
 * The one-click surface: start a Nexi workspace on fleet compute and connect to
 * it when it comes up.
 *
 * Owns the panel chrome — the duration picker, the create button, and the
 * composition of session rows. The list is split into sessions still doing
 * work (shown by default, with their row actions) and a collapsed history of
 * finished sessions (capped, no actions); the split rule lives in
 * `t3team-cloudSessionSplit`, the history disclosure in
 * `t3team-CloudSessionHistoryDisclosure`, the per-row rendering in
 * `t3team-CloudSessionProvisionRow`, and the phase wording in
 * `t3team-cloudSessionProvisionPresentation`.
 *
 * Presentational by design. It owns no fetching and no dispatch — the caller
 * supplies the sessions and handles the actions — so the whole lifecycle can be
 * driven from a story without a live fleet, and so the provider wiring stays a
 * separate, replaceable layer.
 */

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

export function CloudSessionProvisionPanel({
  sessions,
  loading = false,
  createPending = false,
  durationSeconds = DEFAULT_CLOUD_SESSION_DURATION_SECONDS,
  onDurationChange,
  onCreate,
  onSessionAction,
  onSessionSecondaryAction,
  pendingSessionId = null,
  pendingKind = null,
  pendingLabel = null,
  empty = null,
}: {
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly loading?: boolean;
  readonly createPending?: boolean;
  readonly durationSeconds?: number;
  readonly onDurationChange?: (seconds: number) => void;
  readonly onCreate: (durationSeconds: number) => void;
  readonly onSessionAction: (session: CloudSession) => void;
  /** Secondary action on a ready row (release the machine). Absent hides it. */
  readonly onSessionSecondaryAction?: ((session: CloudSession) => void) | undefined;
  /** Session whose action is in flight, so only that row shows a pending state. */
  readonly pendingSessionId?: string | null;
  /** Which action on that session is in flight: drives the pending button. */
  readonly pendingKind?: "connect" | "cancel" | "stop" | null;
  /** Label for the in-flight primary button (Connect/Cancel); defaults to "Working…". */
  readonly pendingLabel?: string | null;
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

  const {
    active: activeSessions,
    history: historySessions,
    hiddenHistoryCount,
  } = useMemo(() => splitCloudSessions(sessions), [sessions]);

  return (
    <section className="space-y-3">
      <header className="flex flex-col gap-3 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0 space-y-1">
          <h2 className="font-medium text-sm">Cloud sessions</h2>
          <p className="text-muted-foreground text-xs">
            {pendingCount > 0
              ? `${pendingCount} starting · usually ready in about ${formatDuration(155)}`
              : "Start a Nexi machine in the cloud and work on it from here."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">Runs for</span>
          <Select
            modal={false}
            value={String(durationSeconds)}
            onValueChange={handleDurationChange}
            items={durationItems}
          >
            <SelectTrigger size="sm" className="w-24 min-w-0" aria-label="Runs for">
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
        ) : (
          <>
            {activeSessions.length === 0
              ? (empty ?? (
                  <div className="px-3 py-8 text-center sm:px-4">
                    <p className="text-muted-foreground text-xs">No active cloud sessions.</p>
                    <p className="text-muted-foreground/80 text-xs">
                      Start one — it will appear here as soon as it is ready.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={createPending}
                      onClick={handleCreate}
                    >
                      {createPending ? "Starting…" : "New session"}
                    </Button>
                  </div>
                ))
              : activeSessions.map((session) => {
                  const isThisPending = pendingSessionId === session.sessionId;
                  return (
                    <CloudSessionRow
                      key={session.sessionId}
                      session={session}
                      onAction={onSessionAction}
                      onSecondaryAction={onSessionSecondaryAction}
                      actionPending={isThisPending && pendingKind !== "stop"}
                      secondaryActionPending={isThisPending && pendingKind === "stop"}
                      pendingLabel={pendingLabel}
                    />
                  );
                })}
            {historySessions.length === 0 ? null : (
              <CloudSessionHistoryDisclosure
                sessions={historySessions}
                hiddenCount={hiddenHistoryCount}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
