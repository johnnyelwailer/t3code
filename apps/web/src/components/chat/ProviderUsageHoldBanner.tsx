/**
 * Provider usage-hold banner (GHE #421, auto-resume layer).
 *
 * Renders below the latest message as a composer-banner item when the
 * server's provider-usage watcher has held this thread's provider rolling
 * window. The state is derived from the thread's persisted activity trail
 * (`provider.usage-hold.*` kinds), so it survives reloads and shows up on
 * every connected client — no extra transport.
 *
 * The per-thread auto-resume toggle (default ON) POSTs to
 * `/api/t3team/thread/provider-hold/control`; the server persists the flip
 * on the hold row and emits an `auto-resume-set` activity, which the
 * derivation below picks up.
 *
 * @module chat/ProviderUsageHoldBanner
 */
import * as React from "react";

const KIND_STARTED = "provider.usage-hold.started";
const KIND_DEFERRED = "provider.usage-hold.deferred";
const KIND_RELEASED = "provider.usage-hold.released";
const KIND_AUTO_RESUME_SET = "provider.usage-hold.auto-resume-set";

export interface ProviderUsageHoldBannerState {
  readonly driver: string | null;
  readonly since: string;
  readonly resetsAt: string | null;
  readonly autoResume: boolean;
}

type HoldActivity = {
  readonly kind: string;
  readonly createdAt: string;
  readonly payload: unknown;
};

function holdPayload(activity: HoldActivity): Record<string, unknown> | null {
  const payload = activity.payload;
  return payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

/**
 * Walk the activity trail in order and fold the hold events into the current
 * banner state. `released` clears it; `auto-resume-set` only adjusts the
 * toggle while a hold is active.
 */
export function deriveProviderUsageHoldBanner(
  activities: ReadonlyArray<HoldActivity>,
): ProviderUsageHoldBannerState | null {
  let hold: ProviderUsageHoldBannerState | null = null;
  for (const activity of activities) {
    const payload = holdPayload(activity);
    if (activity.kind === KIND_STARTED || activity.kind === KIND_DEFERRED) {
      hold = {
        driver: typeof payload?.driver === "string" ? payload.driver : null,
        since: activity.createdAt,
        resetsAt: typeof payload?.resetsAt === "string" ? payload.resetsAt : null,
        autoResume: payload?.autoResume !== false,
      };
    } else if (activity.kind === KIND_RELEASED) {
      hold = null;
    } else if (activity.kind === KIND_AUTO_RESUME_SET && hold !== null) {
      const current: ProviderUsageHoldBannerState = hold;
      const flipped = typeof payload?.autoResume === "boolean" ? payload.autoResume : null;
      if (flipped !== null) {
        hold = { ...current, autoResume: flipped };
      }
    }
  }
  return hold;
}

/** Human reset moment: "in 43m" while it is in the future, else the clock time. */
export function describeHoldReset(resetsAt: string, nowMs: number): string {
  const targetMs = Date.parse(resetsAt);
  if (Number.isNaN(targetMs)) return "reset time unknown";
  const deltaMs = targetMs - nowMs;
  if (deltaMs <= 0) return "window should have reset";
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "window resets shortly";
  if (minutes < 60) return `window resets in ~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `window resets in ~${hours}h`
    : `window resets in ~${hours}h ${rest}m`;
}

export function ProviderUsageHoldToggle(props: {
  readonly threadId: string;
  readonly httpBaseUrl: string;
  readonly autoResume: boolean;
  readonly onFlipped: (autoResume: boolean) => void;
}): React.ReactElement {
  const [pending, setPending] = React.useState(false);

  const flip = React.useCallback(
    async (next: boolean) => {
      setPending(true);
      try {
        const base = props.httpBaseUrl.replace(/\/+$/, "");
        await fetch(`${base}/api/t3team/thread/provider-hold/control`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: props.threadId, autoResume: next }),
        });
        props.onFlipped(next);
      } catch {
        // The server activity stream re-syncs the toggle on the next push;
        // a transient fetch failure just keeps the previous position.
      } finally {
        setPending(false);
      }
    },
    [props.httpBaseUrl, props.threadId, props.onFlipped],
  );

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={props.autoResume ? "Disable auto-resume for this thread" : "Enable auto-resume for this thread"}
      title={
        props.autoResume
          ? "Auto-resume is ON — this thread resumes automatically when the provider window resets"
          : "Auto-resume is OFF — this thread stays paused until you resume it manually"
      }
      onClick={() => void flip(!props.autoResume)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-opacity disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
          props.autoResume ? "bg-emerald-500/80" : "bg-muted-foreground/30"
        }`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-2.5 w-2.5 transform rounded-full bg-background transition-transform ${
            props.autoResume ? "translate-x-3" : "translate-x-0.5"
          }`}
        />
      </span>
      Auto-resume {props.autoResume ? "on" : "off"}
    </button>
  );
}
