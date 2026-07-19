import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import type { T3WorkProjectSetupProfileId } from "~/t3work/t3work-projectSetup";
import {
  listT3workProjectSetupCardOptions,
  type T3workProjectSetupCardOption,
} from "~/t3work/t3work-projectSetupProfileCatalog";

export { listT3workProjectSetupCardOptions } from "~/t3work/t3work-projectSetupProfileCatalog";
export type { T3workProjectSetupCardOption } from "~/t3work/t3work-projectSetupProfileCatalog";

function CardIcon({ option, compact }: { option: T3workProjectSetupCardOption; compact: boolean }) {
  if (option.iconSrc) {
    return (
      <img
        src={option.iconSrc}
        alt=""
        className={cn("shrink-0 object-contain", compact ? "size-16" : "size-20")}
      />
    );
  }
  const Icon = option.icon;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        compact ? "size-11" : "size-12",
        option.iconClassName,
      )}
    >
      <Icon className={cn(compact ? "size-5" : "size-6")} />
    </span>
  );
}

export function T3workProjectSetupProfileCards({
  selectedProfileId,
  onSelectProfile,
  compact = false,
  profiles,
}: {
  selectedProfileId: T3WorkProjectSetupProfileId;
  onSelectProfile: (profileId: T3WorkProjectSetupProfileId) => void;
  compact?: boolean;
  /** Pack-contributed profiles; when present they replace the built-in catalog. */
  profiles?: readonly EnvironmentSetupProfile[] | undefined;
}) {
  const options = listT3workProjectSetupCardOptions(profiles);

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: compact
          ? "repeat(auto-fit, minmax(min(100%, 13rem), 1fr))"
          : "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))",
      }}
    >
      {options.map((option, index) => {
        const selected = option.id === selectedProfileId;
        return (
          <button
            key={option.id}
            type="button"
            data-profile-id={option.id}
            data-selected={selected ? "true" : "false"}
            aria-pressed={selected}
            onClick={() => onSelectProfile(option.id)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              compact ? "min-h-[9rem] p-4" : "min-h-[10.5rem] p-5",
              selected
                ? "border-primary/60 bg-card shadow-lg shadow-primary/10"
                : "border-border/70 bg-card/85 hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-black/5",
            )}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 bg-gradient-to-br transition-opacity duration-300",
                option.accentClassName,
                selected ? "opacity-100" : "opacity-70 group-hover:opacity-90",
              )}
            />
            <div className="relative grid h-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
              <CardIcon option={option} compact={compact} />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  {option.eyebrow}
                </div>
                <h3
                  className={cn(
                    "mt-1 font-semibold tracking-tight",
                    compact ? "text-base" : "text-lg",
                  )}
                >
                  {option.title}
                </h3>
              </div>
              <p
                className={cn(
                  "col-span-2 line-clamp-2 text-muted-foreground",
                  compact ? "text-xs leading-5" : "text-sm leading-6",
                )}
              >
                {option.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
