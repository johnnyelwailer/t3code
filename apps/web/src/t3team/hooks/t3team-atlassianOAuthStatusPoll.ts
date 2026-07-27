import type { ManualAtlassianSigninOutcome } from "~/t3team/hooks/t3team-atlassianOAuthManualSignin";
import type { AtlassianOAuthFlowStatus } from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";

const STATUS_POLL_INTERVAL_MS = 2_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * Watches one server-owned flow's outcome directly, by `state`, instead of waiting for a signal that
 * can only reach this tab by accident (a same-origin broadcast, a new account showing up). This is
 * what makes a popup-blocked sign-in completed in a *different* browser observable at all.
 *
 * `getServerState` is read fresh on every tick rather than captured once: copying a fresh sign-in link
 * mid-wait mints a new flow (see `t3team-atlassianOAuthServerFlow.ts`), and this has to follow that
 * newest state rather than keep watching one the user has already moved on from.
 *
 * A state seen `pending` and then `unknown` has expired — evicted or past its TTL server-side, and
 * uncompletable from here on. That is reported once through `onLinkExpired` so the caller can offer a
 * fresh link, but it does not end this wait on its own: the account-appearance and broadcast-channel
 * races run alongside it and might still succeed, including through a link the user requests next.
 */
export async function pollAtlassianOAuthFlowStatus(input: {
  readonly getServerState: () => string | null;
  readonly getStatus: (state: string) => Promise<AtlassianOAuthFlowStatus>;
  readonly deadlineMs: number;
  readonly isCancelled: () => boolean;
  readonly onLinkExpired: () => void;
}): Promise<ManualAtlassianSigninOutcome> {
  let sawPendingFor: string | null = null;

  while (!input.isCancelled() && Date.now() < input.deadlineMs) {
    await sleep(STATUS_POLL_INTERVAL_MS);
    if (input.isCancelled()) break;

    const state = input.getServerState();
    if (!state) continue;

    try {
      const status = await input.getStatus(state);
      if (status === "completed") return { kind: "server_connected" };
      if (status === "pending") {
        sawPendingFor = state;
        continue;
      }
      // `unknown`: only worth reporting as an expiry once this exact state was seen pending — an
      // `unknown` before that just means the flow has not been registered yet, or was never live.
      if (sawPendingFor === state) {
        input.onLinkExpired();
        sawPendingFor = null;
      }
    } catch {
      // A failed poll tells us nothing; keep watching until the deadline.
    }
  }

  return { kind: "timed_out" };
}
