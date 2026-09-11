import { ATLASSIAN_OAUTH_FLOW_TTL_MS } from "@t3tools/integrations-atlassian";

import { waitForOAuthCallback } from "~/t3team/hooks/t3team-atlassianOAuthPopup";
import type { AtlassianOAuthFlowStatus } from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";
import { pollAtlassianOAuthFlowStatus } from "~/t3team/hooks/t3team-atlassianOAuthStatusPoll";

/**
 * Keeps a sign-in attempt alive after the popup stopped being the way it will finish.
 *
 * Two things can now finish the sign-in and they need watching at once:
 *
 * - The user opens the link in *this* browser. The callback page broadcasts on the same-origin
 *   channel, so `waitForOAuthCallback` hears it, and the caller decides whether the returned `state`
 *   belongs to its own tab-owned flow or to the server-owned one.
 * - The user opens the link in *another* browser or on their phone — the case the shareable link
 *   exists for. Nothing can reach this tab from there, so the only observable signal is the server
 *   having a new Atlassian account. Polling the account list is that signal.
 *
 * Neither branch rejects: a sign-in that has not happened yet is not an error, and the caller needs a
 * decidable outcome for every ending, including the user simply walking away.
 */
export type ManualAtlassianSigninOutcome =
  | { readonly kind: "callback"; readonly href: string }
  | { readonly kind: "server_connected" }
  | { readonly kind: "timed_out" };

const ACCOUNT_POLL_INTERVAL_MS = 3_000;

function hasNewAccount(baseline: ReadonlyArray<string>, current: ReadonlyArray<string>): boolean {
  const known = new Set(baseline);
  return current.some((id) => !known.has(id));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * Poll until an account the caller had not already seen shows up.
 *
 * Compared against a baseline rather than against "any account at all" so a reconnect — where
 * accounts already exist — is still detected, and so a failed poll (server restarting, request
 * dropped) is skipped rather than mistaken for a result.
 */
async function waitForNewAtlassianAccount(input: {
  readonly listAccountIds: () => Promise<ReadonlyArray<string>>;
  readonly baselineAccountIds: ReadonlyArray<string>;
  readonly deadlineMs: number;
  readonly isCancelled: () => boolean;
}): Promise<boolean> {
  while (!input.isCancelled() && Date.now() < input.deadlineMs) {
    await sleep(ACCOUNT_POLL_INTERVAL_MS);
    if (input.isCancelled()) return false;
    try {
      if (hasNewAccount(input.baselineAccountIds, await input.listAccountIds())) {
        return true;
      }
    } catch {
      // A poll that fails tells us nothing; keep watching until the deadline.
    }
  }
  return false;
}

export async function awaitManualAtlassianSignin(input: {
  readonly redirectUri: string;
  readonly listAccountIds: () => Promise<ReadonlyArray<string>>;
  readonly baselineAccountIds: ReadonlyArray<string>;
  /** Read fresh by the status poll on every tick, so minting a fresh link mid-wait retargets it. */
  readonly getServerState: () => string | null;
  readonly getStatus: (state: string) => Promise<AtlassianOAuthFlowStatus>;
  readonly isCancelled: () => boolean;
  readonly onLinkExpired: () => void;
  readonly timeoutMs?: number;
}): Promise<ManualAtlassianSigninOutcome> {
  // Same deadline the server's pending-flow store uses; see ATLASSIAN_OAUTH_FLOW_TTL_MS.
  const timeoutMs = input.timeoutMs ?? ATLASSIAN_OAUTH_FLOW_TTL_MS;
  const deadlineMs = Date.now() + timeoutMs;
  let settled = false;
  const isCancelled = () => settled || input.isCancelled();

  // `null` popup: there is no window handle to poll, which is exactly the "user opens the link
  // themselves" shape `waitForOAuthCallback` already supports.
  const callback = waitForOAuthCallback(null, input.redirectUri, timeoutMs).then(
    (href): ManualAtlassianSigninOutcome => ({ kind: "callback", href }),
    (): ManualAtlassianSigninOutcome => ({ kind: "timed_out" }),
  );

  const accountAppeared = waitForNewAtlassianAccount({
    listAccountIds: input.listAccountIds,
    baselineAccountIds: input.baselineAccountIds,
    deadlineMs,
    isCancelled,
  }).then(
    (found): ManualAtlassianSigninOutcome =>
      found ? { kind: "server_connected" } : { kind: "timed_out" },
  );

  // The most direct signal: it asks the server about this exact flow instead of waiting for one to
  // arrive by accident, which is what actually lets a sign-in finished in a different browser be
  // noticed here at all.
  const statusPoll = pollAtlassianOAuthFlowStatus({
    getServerState: input.getServerState,
    getStatus: input.getStatus,
    deadlineMs,
    isCancelled,
    onLinkExpired: input.onLinkExpired,
  });

  const outcome = await Promise.race([callback, accountAppeared, statusPoll]);
  settled = true;
  if (outcome.kind !== "timed_out") return outcome;

  // One branch timing out does not end the attempt; the others may still be live.
  const remaining = await Promise.all([callback, accountAppeared, statusPoll]);
  return remaining.find((candidate) => candidate.kind !== "timed_out") ?? { kind: "timed_out" };
}
