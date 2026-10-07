import { BotIcon } from "lucide-react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import {
  formatActiveAgentLabel,
  setActiveAgentHover,
  type ActiveAgentEntry,
} from "~/t3team/chat/t3team-activeAgentsCore";

/**
 * The working row's active-agent cluster: one chip per child, driver logo
 * plus the status word. Hover shows title and status. Click opens that child.
 */
export function T3TeamActiveAgentsIndicator({
  entries,
  onOpenAgents,
  onOpenAgent,
  className,
}: {
  entries: readonly ActiveAgentEntry[];
  onOpenAgents: () => void;
  /**
   * Per-chip open. When provided, clicking a chip opens THAT agent (its
   * thread) instead of the whole agents surface.
   */
  onOpenAgent?: ((entry: ActiveAgentEntry) => void) | undefined;
  className?: string | undefined;
}) {
  const groupLabel = `${entries.length} active agent${entries.length === 1 ? "" : "s"}`;
  return (
    <span
      role="group"
      aria-label={groupLabel}
      className={cn("ml-2 inline-flex min-w-0 shrink items-center gap-1", className)}
    >
      {entries.map((entry) => {
        const hoverLabel = formatActiveAgentLabel(entry.title, entry.statusLabel);
        const provider = entry.provider;
        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  data-t3team-agent-chip=""
                  data-t3team-state={entry.dotState}
                  aria-label={hoverLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onOpenAgent) onOpenAgent(entry);
                    else onOpenAgents();
                  }}
                  onMouseEnter={() => setActiveAgentHover(entry)}
                  onMouseLeave={() => setActiveAgentHover(null)}
                  onFocus={() => setActiveAgentHover(entry)}
                  onBlur={() => setActiveAgentHover(null)}
                  className="inline-flex h-5 max-w-36 cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-1.5 text-3xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                />
              }
            >
              {provider ? (
                <ProviderInstanceIcon
                  driverKind={provider.driverKind}
                  displayName={provider.displayName}
                  iconDataUrl={provider.iconDataUrl}
                  acpRegistryIconUrl={provider.acpRegistryIconUrl}
                  iconClassName="size-3.5"
                  className="z-auto"
                />
              ) : (
                <BotIcon aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{entry.statusLabel}</span>
            </TooltipTrigger>
            <TooltipPopup side="top">{hoverLabel}</TooltipPopup>
          </Tooltip>
        );
      })}
    </span>
  );
}
