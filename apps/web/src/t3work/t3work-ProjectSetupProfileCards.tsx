import { Bug, ClipboardList, Code2, Sparkles, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import {
  listT3WorkProjectSetupProfiles,
  type T3WorkProjectSetupProfileId,
} from "~/t3work/t3work-projectSetup";

type T3workProjectSetupCardOption = {
  readonly id: T3WorkProjectSetupProfileId;
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly chips: readonly [string, string];
  readonly icon: LucideIcon;
  readonly accentClassName: string;
  readonly iconClassName: string;
};

const PROFILE_VISUALS: Record<
  T3WorkProjectSetupProfileId,
  Omit<T3workProjectSetupCardOption, "id" | "title" | "description">
> = {
  "project-partner": {
    eyebrow: "Friendly",
    chips: ["Plain language", "Fast summaries"],
    icon: Sparkles,
    accentClassName:
      "from-sky-500/18 via-cyan-400/18 to-emerald-400/16 dark:from-sky-400/20 dark:via-cyan-300/16 dark:to-emerald-300/14",
    iconClassName: "text-sky-600 dark:text-sky-300",
  },
  "requirements-engineer": {
    eyebrow: "Understanding",
    chips: ["Clear communication", "Ambiguity checks"],
    icon: ClipboardList,
    accentClassName:
      "from-amber-500/18 via-orange-400/18 to-rose-400/16 dark:from-amber-300/18 dark:via-orange-300/14 dark:to-rose-300/14",
    iconClassName: "text-amber-600 dark:text-amber-300",
  },
  "test-engineer": {
    eyebrow: "Show & Tell",
    chips: ["Repro steps", "Product flows"],
    icon: Bug,
    accentClassName:
      "from-emerald-500/18 via-lime-400/16 to-cyan-400/16 dark:from-emerald-300/18 dark:via-lime-300/14 dark:to-cyan-300/14",
    iconClassName: "text-emerald-600 dark:text-emerald-300",
  },
  developer: {
    eyebrow: "Build",
    chips: ["Technical depth", "Verification bias"],
    icon: Code2,
    accentClassName:
      "from-fuchsia-500/18 via-violet-400/16 to-blue-400/16 dark:from-fuchsia-300/18 dark:via-violet-300/14 dark:to-blue-300/14",
    iconClassName: "text-fuchsia-600 dark:text-fuchsia-300",
  },
};

export function listT3workProjectSetupCardOptions(): ReadonlyArray<T3workProjectSetupCardOption> {
  return listT3WorkProjectSetupProfiles().map((profile) => {
    const visuals = PROFILE_VISUALS[profile.id];
    return {
      id: profile.id,
      title: profile.title,
      description: profile.description,
      eyebrow: visuals.eyebrow,
      chips: visuals.chips,
      icon: visuals.icon,
      accentClassName: visuals.accentClassName,
      iconClassName: visuals.iconClassName,
    };
  });
}

export function T3workProjectSetupProfileCards({
  selectedProfileId,
  onSelectProfile,
  compact = false,
}: {
  selectedProfileId: T3WorkProjectSetupProfileId;
  onSelectProfile: (profileId: T3WorkProjectSetupProfileId) => void;
  compact?: boolean;
}) {
  const options = listT3workProjectSetupCardOptions();

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
        const Icon = option.icon;
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
              compact ? "min-h-[10.5rem] p-4" : "min-h-[13rem] p-5",
              selected
                ? "border-primary/60 bg-card shadow-lg shadow-primary/10"
                : "border-border/70 bg-card/85 hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-black/5",
            )}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 transition-opacity duration-300",
                option.accentClassName,
                selected ? "motion-safe:animate-pulse" : "opacity-75 group-hover:opacity-90",
              )}
            />
            <div className="pointer-events-none absolute -right-10 top-0 size-28 rounded-full bg-white/25 blur-3xl dark:bg-white/10" />

            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                    {option.eyebrow}
                  </div>
                  <h3
                    className={cn(
                      "mt-2 font-semibold tracking-tight",
                      compact ? "text-base" : "text-lg",
                    )}
                  >
                    {option.title}
                  </h3>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center",
                    compact ? "size-10" : "size-11",
                    option.iconClassName,
                  )}
                >
                  <Icon className={cn(compact ? "size-4.5" : "size-5")} />
                </span>
              </div>

              <p
                className={cn(
                  "mt-3 text-muted-foreground",
                  compact ? "text-xs leading-5" : "text-sm leading-6",
                )}
              >
                {option.description}
              </p>

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {option.chips.map((chip) => (
                  <span
                    key={chip}
                    className="px-0 py-0 text-[11px] font-medium text-foreground/70 dark:text-foreground/75"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
