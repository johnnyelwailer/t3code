import {
  formatActiveAgentLabel,
  setActiveAgentHover,
  type ActiveAgentEntry,
} from "~/t3team/chat/t3team-activeAgentsCore";
import { SubRunDriverIcon } from "~/t3team/chat/t3team-subRunDriverIcon";

/**
 * Active children in the thread's working row: one small chip per child, with
 * the driver logo and the live status. Hover carries the title plus status.
 * Click opens that child.
 */
export function T3TeamActiveAgentsIndicator({
  entries,
  onOpenAgents,
  onOpenAgent,
}: {
  entries: readonly ActiveAgentEntry[];
  onOpenAgents: () => void;
  onOpenAgent?: ((entry: ActiveAgentEntry) => void) | undefined;
}) {
  if (entries.length === 0) return null;
  const groupLabel = `${entries.length} active agent${entries.length === 1 ? "" : "s"}`;
  return (
    <span
      role="group"
      aria-label={groupLabel}
      className="ml-auto inline-flex min-w-0 shrink items-center gap-1"
    >
      {entries.map((entry) => {
        const hoverLabel = formatActiveAgentLabel(entry.title, entry.statusLabel);
        return (
          <button
            key={entry.id}
            type="button"
            title={hoverLabel}
            aria-label={hoverLabel}
            data-t3team-state={entry.dotState}
            onClick={(event) => {
              event.stopPropagation();
              if (onOpenAgent) onOpenAgent(entry);
              else onOpenAgents();
            }}
            onMouseEnter={() => setActiveAgentHover(entry)}
            onMouseLeave={() => setActiveAgentHover(null)}
            onFocus={() => setActiveAgentHover(entry)}
            onBlur={() => setActiveAgentHover(null)}
            className="t3team-aci-cell inline-flex h-5 max-w-36 min-w-0 items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-1.5 text-2xs text-muted-foreground"
          >
            <SubRunDriverIcon driver={entry.driver} />
            <span className="min-w-0 truncate">{entry.statusLabel}</span>
          </button>
        );
      })}
    </span>
  );
}
