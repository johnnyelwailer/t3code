/**
 * Design variants for the sidebar project-scope pills (story-only, 2026-09-14). Each variant
 * renders the SAME data (`SidebarProjectSnapshot[]` in sidebar order) and the same selection
 * contract as the production `T3TeamSidebarProjectScopePills`; the chosen one gets ported back
 * into that component. Every variant reacts to its own container width via `@container/pills`.
 */
import { FolderIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import { cn } from "~/lib/utils";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

export type ScopeVariantProps = {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
};

const INITIALS_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

/** "nexi-work" → "NW", "Nexi Portal" → "NP", "t3code" → "T3". Tone is stable per name. */
export function projectInitials(name: string): string {
  const words = name.split(/[\s\-_/.]+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]![0]}${words[1]![0]}`
      : (words[0] ?? name).replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return letters.toUpperCase();
}

function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return INITIALS_TONES[hash % INITIALS_TONES.length]!;
}

/** Initials disc used where a project has neither favicon nor chosen icon. */
export function ProjectInitials({
  name,
  className,
}: {
  name: string;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold leading-none tracking-tight",
        toneFor(name),
        className,
      )}
    >
      {projectInitials(name)}
    </span>
  );
}

function Favicon({ group, className }: { group: SidebarProjectSnapshot; className?: string }) {
  const Initials = ({ className: c }: { className?: string }) => (
    <ProjectInitials name={group.displayName} className={c} />
  );
  return (
    <ProjectFavicon
      environmentId={group.environmentId}
      cwd={group.workspaceRoot}
      projectName={group.title}
      faviconPath={group.faviconPath}
      projectIcon={group.projectIcon}
      fallbackIcon={Initials}
      className={className ?? "size-4 shrink-0"}
    />
  );
}

/** Icon + "All" entries share one render path so every variant treats "All" as a peer. */
function entries(groups: ReadonlyArray<SidebarProjectSnapshot>) {
  return [
    { key: null as string | null, label: "All projects", icon: <FolderIcon className="size-4" /> },
    ...groups.map((group) => ({
      key: group.projectKey as string | null,
      label: group.displayName,
      icon: <Favicon group={group} />,
    })),
  ];
}

function Pill({
  active,
  label,
  onClick,
  className,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center outline-none transition-[margin,opacity,transform,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * V1 — Avatar stack. Round discs that overlap like an avatar pile; the overlap relaxes as the
 * container widens. Selection = the disc comes forward: full color, lifted, with a gap ring in
 * the sidebar color (the "cut-out" avatar-stack look), while the rest sit back, dimmed.
 */
export function ScopeStackVariant({ groups, activeScopeKey, onSelectScope }: ScopeVariantProps) {
  return (
    <div className="@container/pills flex min-w-0 flex-1 items-center overflow-hidden">
      <div className="flex items-center pl-1">
        {entries(groups).map((entry, index) => {
          const active = entry.key === activeScopeKey;
          return (
            <Pill
              key={entry.key ?? "all"}
              active={active}
              label={entry.label}
              onClick={() => onSelectScope(entry.key)}
              className={cn(
                "size-7 rounded-full bg-background ring-2 ring-sidebar shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
                index > 0 && "-ml-3 @[15rem]/pills:-ml-2 @[19rem]/pills:-ml-0.5",
                active
                  ? "z-10 scale-110 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground opacity-60 saturate-[0.5] hover:z-20 hover:-translate-y-px hover:opacity-100 hover:saturate-100",
              )}
            >
              {entry.icon}
            </Pill>
          );
        })}
      </div>
    </div>
  );
}

/**
 * V2 — Segmented track. One soft track; the selected item is a raised chip (iOS segmented
 * control), no border. When the container is wide enough the active chip also reveals its name.
 */
export function ScopeSegmentedVariant({
  groups,
  activeScopeKey,
  onSelectScope,
}: ScopeVariantProps) {
  return (
    <div className="@container/pills flex min-w-0 flex-1 items-center">
      <div className="flex min-w-0 items-center gap-px overflow-hidden rounded-full bg-muted/70 p-0.5">
        {entries(groups).map((entry) => {
          const active = entry.key === activeScopeKey;
          return (
            <Pill
              key={entry.key ?? "all"}
              active={active}
              label={entry.label}
              onClick={() => onSelectScope(entry.key)}
              className={cn(
                "h-6 min-w-6 gap-1.5 rounded-full px-1",
                active
                  ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] @[17rem]/pills:px-2"
                  : "text-muted-foreground opacity-70 hover:opacity-100",
              )}
            >
              {entry.icon}
              {active ? (
                <span className="hidden max-w-24 truncate text-xs font-medium @[17rem]/pills:inline">
                  {entry.label}
                </span>
              ) : null}
            </Pill>
          );
        })}
      </div>
    </div>
  );
}

/**
 * V3 — Quiet row with an indicator dot. Bare icons, evenly spaced (tightening to a slight
 * overlap when narrow); the selection is a small accent dot under the icon plus full opacity.
 * Nothing is boxed, so it reads as part of the header rather than a toolbar.
 */
export function ScopeDotVariant({ groups, activeScopeKey, onSelectScope }: ScopeVariantProps) {
  return (
    <div className="@container/pills flex min-w-0 flex-1 items-center overflow-hidden">
      <div className="flex items-center">
        {entries(groups).map((entry, index) => {
          const active = entry.key === activeScopeKey;
          return (
            <Pill
              key={entry.key ?? "all"}
              active={active}
              label={entry.label}
              onClick={() => onSelectScope(entry.key)}
              className={cn(
                "size-7 rounded-md",
                index > 0 && "-ml-1.5 @[15rem]/pills:ml-0 @[19rem]/pills:ml-1",
                active
                  ? "text-foreground after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary"
                  : "text-muted-foreground opacity-50 hover:bg-sidebar-accent/60 hover:opacity-100",
              )}
            >
              {entry.icon}
            </Pill>
          );
        })}
      </div>
    </div>
  );
}
