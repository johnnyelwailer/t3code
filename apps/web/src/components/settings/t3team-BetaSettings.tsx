/**
 * The "Beta" settings section: feature flags for the My Work Digest variants.
 * Flags persist in localStorage via `t3team-betaFlags`; the digest views read
 * the same store through `useT3TeamBetaFlags`.
 */
import {
  DEFAULT_T3TEAM_BETA_FLAGS,
  resetT3TeamBetaFlags,
  useT3TeamBetaFlags,
  type T3TeamBetaFlags,
} from "../../t3team/t3team-betaFlags";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

interface BetaFlagOption<K extends keyof T3TeamBetaFlags> {
  key: K;
  label: string;
  description: string;
  options: ReadonlyArray<{ value: T3TeamBetaFlags[K]; label: string }>;
}

function BetaFlagSelect<K extends keyof T3TeamBetaFlags>({
  flag,
  value,
  onSelect,
}: {
  flag: BetaFlagOption<K>;
  value: T3TeamBetaFlags[K];
  onSelect: (value: T3TeamBetaFlags[K]) => void;
}) {
  const selection = flag.options.find((option) => option.value === value) ?? flag.options[0];
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium">{flag.label}</h4>
      <p className="text-xs text-muted-foreground">{flag.description}</p>
      <Select value={String(value)} onValueChange={(next) => onSelect(next as T3TeamBetaFlags[K])}>
        <SelectTrigger className="w-full sm:w-56" aria-label={flag.label}>
          <SelectValue>{selection?.label ?? String(value)}</SelectValue>
        </SelectTrigger>
        <SelectPopup align="start" alignItemWithTrigger={false}>
          {flag.options.map((option) => (
            <SelectItem key={option.value} hideIndicator value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

export function T3TeamBetaSettings() {
  const { flags, setFlag } = useT3TeamBetaFlags();
  const isDefault = JSON.stringify(flags) === JSON.stringify(DEFAULT_T3TEAM_BETA_FLAGS);

  return (
    <div className="mb-8 space-y-4 rounded-xl border bg-card/50 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Beta</h3>
        <p className="text-sm text-muted-foreground">
          Experimental My Work Digest variants. These settings apply to this device only.
        </p>
      </div>
      <div className="space-y-4">
        <BetaFlagSelect
          flag={{
            key: "digestBurndownVariant",
            label: "Burndown in digest header",
            description: "Show how much of the sprint still remains in the digest header.",
            options: [
              { value: "off", label: "Off" },
              { value: "chart", label: "Chart" },
              { value: "sparkline", label: "Sparkline" },
            ],
          }}
          value={flags.digestBurndownVariant}
          onSelect={(value) => setFlag("digestBurndownVariant", value)}
        />
        <BetaFlagSelect
          flag={{
            key: "digestDefaultLens",
            label: "Default My Work lens",
            description: "Which lens opens first when no lens has been chosen yet.",
            options: [
              { value: "digest", label: "Digest" },
              { value: "hierarchy", label: "Hierarchy" },
              { value: "board", label: "Board" },
            ],
          }}
          value={flags.digestDefaultLens}
          onSelect={(value) => setFlag("digestDefaultLens", value)}
        />
        <BetaFlagSelect
          flag={{
            key: "digestRowNavigation",
            label: "Digest row navigation",
            description: "How digest rows open their ticket once row navigation lands.",
            options: [
              { value: "in-app", label: "In-app" },
              { value: "ticket-url", label: "Ticket URL" },
            ],
          }}
          value={flags.digestRowNavigation}
          onSelect={(value) => setFlag("digestRowNavigation", value)}
        />
        <BetaFlagSelect
          flag={{
            key: "digestAgentDots",
            label: "Agent dots on digest rows",
            description: "How agents that touched a ticket appear on digest rows.",
            options: [
              { value: "stacked", label: "Stacked" },
              { value: "badges", label: "Badges" },
            ],
          }}
          value={flags.digestAgentDots}
          onSelect={(value) => setFlag("digestAgentDots", value)}
        />
      </div>
      <div className="border-t pt-4">
        <Button
          size="sm"
          variant="outline"
          disabled={isDefault}
          onClick={() => resetT3TeamBetaFlags()}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
