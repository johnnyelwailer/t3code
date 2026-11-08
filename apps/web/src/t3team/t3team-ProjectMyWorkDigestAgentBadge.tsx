import { BotIcon } from "lucide-react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { useEnvironmentProviders } from "~/state/environments";
import { findProvider, providerMark } from "~/t3team/chat/t3team-useActiveAgents";
import { type ClaimFreshness, claimFreshness } from "~/t3team/t3team-digestAgentClaimFacts";
import type { DigestClaim } from "~/t3team/t3team-projectMyWorkDigestPlan";

const BADGE_BASE =
  "inline-flex h-5 items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-1.5";

/**
 * The badge's freshness mark mirrors the stacked dot: fresh runs the duty-cycled
 * `animate-status-pulse` (still under reduced motion), idle is static, stale is outlined.
 */
function freshnessDotClassName(freshness: ClaimFreshness): string {
  const base = "size-1.5 shrink-0 rounded-full";
  if (freshness === "fresh")
    return `${base} bg-success animate-status-pulse motion-reduce:animate-none`;
  if (freshness === "idle") return `${base} bg-muted-foreground/50`;
  return `${base} border border-muted-foreground/40 bg-transparent`;
}

/**
 * One claiming agent thread as a pill: its real provider icon plus the freshness mark. A claim
 * without a resolvable provider instance shows the generic bot glyph instead of a guess.
 */
export function DigestAgentBadge({ claim, nowMs }: { claim: DigestClaim; nowMs: number }) {
  const providersByEnvironment = useEnvironmentProviders();
  const mark = providerMark(findProvider(providersByEnvironment, claim.providerInstanceId));
  const freshness = claimFreshness(claim, nowMs);
  return (
    <span
      aria-hidden
      data-t3team-digest-agent-badge=""
      data-t3team-state={freshness}
      className={freshness === "stale" ? `${BADGE_BASE} opacity-70` : BADGE_BASE}
    >
      {mark ? (
        <ProviderInstanceIcon
          driverKind={mark.driverKind}
          displayName={mark.displayName}
          iconDataUrl={mark.iconDataUrl}
          acpRegistryIconUrl={mark.acpRegistryIconUrl}
          iconClassName="size-3.5"
          className="z-auto"
        />
      ) : (
        <BotIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className={freshnessDotClassName(freshness)} />
    </span>
  );
}
