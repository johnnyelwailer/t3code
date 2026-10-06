import type { CloudSession } from "@t3tools/contracts";
import { type ReactNode, useCallback, useMemo } from "react";

import { Button } from "../ui/button";
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
 * Owns the panel chrome — the create button and the
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

export function CloudSessionProvisionPanel({
  sessions,
  loading = false,
  loadError = null,
  createPending = false,
  onCreate,
  onSessionAction,
  onSessionSecondaryAction,
  pendingSessionId = null,
  pendingKind = null,
  pendingLabel = null,
  historyUrl = null,
  onSessionForget,
  canForgetSession,
  empty = null,
  banner = null,
}: {
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly loading?: boolean;
  /** Why the session list could not be read; replaces the rows when set. */
  readonly loadError?: string | null;
  readonly createPending?: boolean;
  readonly onCreate: () => void;
  readonly onSessionAction: (session: CloudSession) => void;
  /** Secondary action on a ready row (release the machine). Absent hides it. */
  readonly onSessionSecondaryAction?: ((session: CloudSession) => void) | undefined;
  /** Session whose action is in flight, so only that row shows a pending state. */
  readonly pendingSessionId?: string | null;
  /** Which action on that session is in flight: drives the pending button. */
  readonly pendingKind?: "connect" | "cancel" | "stop" | null;
  /** Label for the in-flight primary button (Connect/Cancel); defaults to "Working…". */
  readonly pendingLabel?: string | null;
  /** The provider's page with every session, linked from the capped history. */
  readonly historyUrl?: string | null;
  /** Forget a ready machine's saved connection (the panel owns the lifecycle). */
  readonly onSessionForget?: ((session: CloudSession) => void) | undefined;
  /** Whether that session's machine is saved here, so Forget would do something. */
  readonly canForgetSession?: ((session: CloudSession) => boolean) | undefined;
  readonly empty?: ReactNode;
  /** Shown under the header, e.g. the account sign-in the broker needs. */
  readonly banner?: ReactNode;
}) {
  const handleCreate = useCallback(() => onCreate(), [onCreate]);

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
          <Button size="sm" disabled={createPending} onClick={handleCreate}>
            {createPending ? "Starting…" : "New session"}
          </Button>
        </div>
      </header>
      {banner}

      <div className="space-y-1">
        {loadError !== null ? (
          <p className="px-3 py-6 text-center text-destructive text-xs sm:px-4">
            Could not load your cloud sessions: {loadError}
          </p>
        ) : loading ? (
          <>
            <CloudSessionRowsSkeleton />
            <CloudSessionRowsSkeleton />
          </>
        ) : (
          <>
            {activeSessions.length === 0
              ? (empty ?? (
                  // Text only: the header's "New session" is the one start
                  // affordance, and it sits beside the duration it will use.
                  <div className="px-3 py-8 text-center sm:px-4">
                    <p className="text-muted-foreground text-xs">No active cloud sessions.</p>
                    <p className="text-muted-foreground/80 text-xs">
                      Start one with New session — it will appear here as soon as it is ready.
                    </p>
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
                      onForget={canForgetSession?.(session) ? onSessionForget : undefined}
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
                historyUrl={historyUrl}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
