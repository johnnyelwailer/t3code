/**
 * Provider usage-hold banner (GHE #421, auto-resume layer).
 *
 * Renders below the latest message as a composer-banner item when a turn on
 * this thread hit its provider instance's usage limit and the server holds
 * it for an automatic re-send after the window resets (sends are never
 * blocked). The state is derived from the thread's persisted activity trail
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
import { formatDuration } from "@t3tools/shared/usageLimits";
import * as React from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const KIND_STARTED = "provider.usage-hold.started";
const KIND_RELEASED = "provider.usage-hold.released";
const KIND_AUTO_RESUME_SET = "provider.usage-hold.auto-resume-set";
const KIND_WARNING = "provider.usage.warning";
const KIND_WARNING_CLEARED = "provider.usage.warning-cleared";

export interface ProviderUsageHoldBannerState {
  readonly driver: string | null;
  readonly since: string;
  readonly resetsAt: string | null;
  readonly autoResume: boolean;
}

/** Lightweight warning state (no hold, no toggle). */
export interface ProviderUsageWarningBannerState {
  readonly driver: string | null;
  readonly percentUsed: number;
  readonly resetsAt: string | null;
  readonly since: string;
}

type HoldActivity = {
  readonly kind: string;
  readonly createdAt: string;
  readonly payload: unknown;
};

function holdPayload(activity: HoldActivity): Record<string, unknown> | null {
  const payload = activity.payload;
  return payload !== null && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : null;
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
    if (activity.kind === KIND_STARTED) {
      // tsgo narrows `hold` to never inside its own assignment; the cast keeps
      // the previous-toggle read outside that write context.
      const prevAutoResume: boolean =
        (hold as ProviderUsageHoldBannerState | null)?.autoResume ?? true;
      hold = {
        driver: typeof payload?.driver === "string" ? payload.driver : null,
        since: activity.createdAt,
        resetsAt: typeof payload?.resetsAt === "string" ? payload.resetsAt : null,
        // Refresh/deferred activities may omit the toggle. Preserve the
        // user's existing choice instead of silently restoring the default.
        autoResume: typeof payload?.autoResume === "boolean" ? payload.autoResume : prevAutoResume,
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

/**
 * Walk the activity trail for warning events. `warning` sets the state;
 * `warning-cleared` or a `hold.started` clears it (critical supersedes).
 */
export function deriveProviderUsageWarningBanner(
  activities: ReadonlyArray<HoldActivity>,
): ProviderUsageWarningBannerState | null {
  let warning: ProviderUsageWarningBannerState | null = null;
  for (const activity of activities) {
    const payload = holdPayload(activity);
    if (activity.kind === KIND_WARNING) {
      warning = {
        driver: typeof payload?.driver === "string" ? payload.driver : null,
        percentUsed: typeof payload?.percentUsed === "number" ? payload.percentUsed : 0,
        resetsAt: typeof payload?.resetsAt === "string" ? payload.resetsAt : null,
        since: activity.createdAt,
      };
    } else if (activity.kind === KIND_WARNING_CLEARED) {
      warning = null;
    } else if (activity.kind === KIND_STARTED) {
      // A hold supersedes the warning.
      warning = null;
    } else if (activity.kind === KIND_RELEASED) {
      // Hold released — the warning may reappear on the next sweep, but we
      // don't re-emit it here (the watcher will).
      warning = null;
    }
  }
  return warning;
}

/**
 * Human reset moment, phrased like the Usage → Limits view (shared
 * `formatDuration`): "resets in 2h 13m" while it is in the future.
 */
export function describeHoldReset(resetsAt: string, nowMs: number): string {
  const targetMs = Date.parse(resetsAt);
  if (Number.isNaN(targetMs)) return "reset time unknown";
  const deltaMs = targetMs - nowMs;
  if (deltaMs <= 0) return "resuming…";
  if (deltaMs < 60_000) return "resets shortly";
  return `resets in ${formatDuration(deltaMs)}`;
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

  const autoResumeTooltip = props.autoResume
    ? "Off: stay on usage limit after the window resets"
    : "On: resume when the window resets";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={pending}
            aria-label={props.autoResume ? "Disable auto-resume" : "Enable auto-resume"}
            onClick={() => void flip(!props.autoResume)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-opacity disabled:opacity-50"
          >
            <span
              className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                props.autoResume ? "bg-success/80" : "bg-muted-foreground/30"
              }`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-2.5 w-2.5 transform rounded-full bg-background transition-transform ${
                  props.autoResume ? "translate-x-3" : "translate-x-0.5"
                }`}
              />
            </span>
            <span className="text-3xs text-muted-foreground">auto-resume</span>
          </button>
        }
      />
      <TooltipPopup side="top">{autoResumeTooltip}</TooltipPopup>
    </Tooltip>
  );
}
