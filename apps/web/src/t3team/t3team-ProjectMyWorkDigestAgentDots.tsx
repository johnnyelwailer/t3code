import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestRows";
import type { DigestClaim } from "~/t3team/t3team-projectMyWorkDigestPlan";

const FRESH_MS = 15 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_DOTS = 3;

type ClaimFreshness = "fresh" | "idle" | "stale";

function claimFreshness(claim: DigestClaim, nowMs: number): ClaimFreshness {
  const ageMs = nowMs - Date.parse(claim.lastActivityAt);
  if (ageMs <= FRESH_MS) return "fresh";
  if (ageMs <= STALE_MS) return "idle";
  return "stale";
}

/**
 * The dot's face, by freshness. Fresh claims run the app's duty-cycled
 * `animate-status-pulse` token (index.css already stills it under
 * prefers-reduced-motion, and `motion-reduce:animate-none` covers the
 * Tailwind side); idle claims are static; stale claims drop to an outline so
 * they read as "was here" rather than "here now".
 */
function dotClassName(freshness: ClaimFreshness): string {
  const base = "size-2.5 rounded-full ring-1 ring-background";
  if (freshness === "fresh")
    return `${base} bg-success animate-status-pulse motion-reduce:animate-none`;
  if (freshness === "idle") return `${base} bg-muted-foreground/50`;
  return `${base} border border-muted-foreground/40 bg-transparent`;
}

function claimTooltip(claim: DigestClaim, nowMs: number): string {
  return `${claim.agent} · ${claim.threadTitle} · updated ${formatDigestAgo(nowMs, claim.lastActivityAt)}`;
}

/**
 * The compact agent-presence stack a digest item carries: one overlapping dot
 * per claiming agent thread, living while fresh, static when idle, outlined
 * when stale. Three dots max, then a "+n". Each dot links to its thread.
 *
 * Modelled on the active-agent dots in the conversation working row
 * (`T3TeamActiveAgentsIndicator` / `ActiveAgentEntry`), so the same shape can
 * later be fed real live agents instead of claims.
 */
export function DigestAgentDots({
  claims,
  nowMs,
}: {
  claims: readonly DigestClaim[];
  nowMs: number;
}) {
  if (claims.length === 0) return null;
  const shown = claims.slice(0, MAX_DOTS);
  const rest = claims.length - shown.length;
  return (
    <span
      className="inline-flex items-center leading-none"
      aria-label={`${claims.length} agent${claims.length === 1 ? "" : "s"} on this item`}
    >
      <span className="flex -space-x-1">
        {shown.map((claim, i) => {
          const dot = (
            <span
              aria-hidden
              className={dotClassName(claimFreshness(claim, nowMs))}
              style={{ zIndex: shown.length - i }}
            />
          );
          const tooltip = (
            <Tooltip>
              <TooltipTrigger
                render={
                  claim.threadUrl ? (
                    <a
                      href={claim.threadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex"
                      aria-label={claimTooltip(claim, nowMs)}
                    >
                      {dot}
                    </a>
                  ) : (
                    <span className="inline-flex">{dot}</span>
                  )
                }
              />
              <TooltipPopup side="top">{claimTooltip(claim, nowMs)}</TooltipPopup>
            </Tooltip>
          );
          return <span key={claim.threadId}>{tooltip}</span>;
        })}
      </span>
      {rest > 0 ? <span className="ml-1 text-[10px] text-muted-foreground">+{rest}</span> : null}
    </span>
  );
}
