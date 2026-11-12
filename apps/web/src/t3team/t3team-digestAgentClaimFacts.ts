import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import type { DigestClaim } from "~/t3team/t3team-projectMyWorkDigestPlan";

const FRESH_MS = 15 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

export type ClaimFreshness = "fresh" | "idle" | "stale";

export function claimFreshness(claim: DigestClaim, nowMs: number): ClaimFreshness {
  if (claim.running) return "fresh";
  if (claim.finished) return "stale";
  const ageMs = nowMs - Date.parse(claim.lastActivityAt);
  if (ageMs <= FRESH_MS) return "fresh";
  if (ageMs <= STALE_MS) return "idle";
  return "stale";
}

export function claimTooltip(claim: DigestClaim, nowMs: number): string {
  const state = claim.running ? "working" : claim.finished ? "finished" : "updated";
  return `${claim.threadTitle} · ${state} ${formatDigestAgo(nowMs, claim.lastActivityAt)} ago`;
}
