import { WifiOffIcon } from "lucide-react";

import {
  ENVIRONMENT_LIVE_STATE_COPY,
  type EnvironmentLiveState,
} from "~/cloud/t3team-environmentLiveState";

/**
 * The working row's lead text while the thread's environment is not live: a frozen sentence in
 * place of "Working for 15s". No timer and no shimmer — nothing is known to be running, so
 * nothing may move. When the connection returns the row goes back to `WorkingLeadText`, whose
 * timer counts from the turn's stored start and is correct again at once.
 */
export function OfflineWorkingLabel({
  state,
}: {
  readonly state: Exclude<EnvironmentLiveState, "live">;
}) {
  return (
    <span
      role="status"
      data-t3team-offline-working={state}
      className="inline-flex min-w-0 items-center gap-1.5 text-warning-foreground"
    >
      <WifiOffIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{ENVIRONMENT_LIVE_STATE_COPY[state].thread}</span>
    </span>
  );
}
