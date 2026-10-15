import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import { isJiraSyncStale } from "~/t3team/t3team-jiraSyncFreshness";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";

export type JiraConnectionView = {
  readonly title: string;
  readonly subtitle: string | null;
  readonly statusLabel: "Connected" | "Needs sign-in";
  readonly needsSignIn: boolean;
  readonly lastSync: { readonly text: string; readonly stale: boolean };
  /** Where the first sync has got, in a short sentence; null once it is done. */
  readonly catchUp: string | null;
  /** Why the account needs attention, in plain words; null when nothing does. */
  readonly problem: string | null;
};

function siteHost(account: AtlassianAccountStatus): string {
  const url = account.accountUrl;
  if (url === undefined) return account.id;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function describeLastSync(account: AtlassianAccountStatus, nowMs: number) {
  if (account.lastSyncAt === undefined) {
    return { text: "Not synced yet", stale: false };
  }
  return {
    text: `Last synced ${formatDigestAgo(nowMs, account.lastSyncAt)} ago`,
    stale: isJiraSyncStale(account.lastSyncAt, nowMs),
  };
}

function describeCatchUp(account: AtlassianAccountStatus): string | null {
  if (account.catchUp === undefined) return null;
  if (account.catchUp.reachedAt === undefined) {
    return "Catching up: loading your most recent tickets first";
  }
  const reached = new Date(account.catchUp.reachedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Catching up: reached ${reached}`;
}

export function describeJiraConnection(
  account: AtlassianAccountStatus,
  nowMs: number,
): JiraConnectionView {
  const host = siteHost(account);
  const needsSignIn = account.status === "needs-reconnect";
  return {
    title: host,
    subtitle: account.label !== host ? account.label : null,
    statusLabel: needsSignIn ? "Needs sign-in" : "Connected",
    needsSignIn,
    lastSync: describeLastSync(account, nowMs),
    catchUp: describeCatchUp(account),
    problem: needsSignIn
      ? "Your Jira session expired. Sign in again to keep your tickets up to date."
      : (account.lastSyncError ?? null),
  };
}
