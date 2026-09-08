/**
 * GHE-40 activity label — story support: sub-run child rows + the settled
 * "Done" card.
 *
 * Split from t3team-ActivityLabelVariants-motions.tsx (LOC ceiling).
 */
import { CircleCheckIcon } from "lucide-react";

import { ProjectFavicon } from "~/components/ProjectFavicon";
import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";

import { EnvironmentId, ProviderDriverKind } from "@t3tools/contracts";

import {
  MorphIcon,
  PROJECT_TITLE,
} from "./t3team-ActivityLabelVariants-motions-primitives";

/**
 * Faithful copy of SidebarSubRunRow (Sidebar.tsx ~line 1825): one-line child
 * row rendered directly below its parent's card. The running child uses the
 * SAME static dashed-circle icon with its shimmer ring. The activity label
 * never animates on child rows: fits → it docks to the right, static;
 * doesn't fit → the title FLIPS to the status text. Live labels shimmer.
 */
export function SubRunRow({
  title,
  state,
  time,
  dockLabel,
  flipLabel,
}: {
  title: string;
  state: "running" | "completed";
  time: string;
  dockLabel?: string;
  flipLabel?: string;
}) {
  return (
    <li role="presentation" className="list-none">
      <button
        type="button"
        className="flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md pe-2.5 ps-[calc(var(--sidebar-content-inset)+1rem)] text-left text-xs outline-none text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
      >
        {state === "running" ? (
          <span className="shrink-0 text-sky-600 dark:text-sky-400">
            <MorphIcon solid={false} size="sm" pulse />
          </span>
        ) : (
          <CircleCheckIcon
            aria-hidden
            className="size-3 shrink-0 text-sidebar-muted-foreground/70"
          />
        )}
        {flipLabel ? (
          /* title flips to the status text (roll in production) */
          <span
            className="min-w-0 flex-1 truncate font-medium text-sky-600 dark:text-sky-400"
            title={title}
          >
            <span className="t3team-label-shimmer">{flipLabel}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{title}</span>
        )}
        {dockLabel ? (
          /* fits → docked to the right, static, no overlap */
          <span className="shrink-0 font-medium text-sky-600 dark:text-sky-400" title={title}>
            <span className="t3team-label-shimmer">{dockLabel}</span>
          </span>
        ) : null}
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground/55 tabular-nums">
          {time}
        </span>
      </button>
    </li>
  );
}

/** Settled "Done" card — context row, production structure. */
export function DoneCard() {
  return (
    <div
      role="button"
      tabIndex={0}
      className="group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md bg-transparent text-sidebar-foreground outline-none select-none hover:bg-sidebar-row-hover"
    >
      <div className="relative z-10 px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            cwd="/tmp/build-40"
            projectName="build-40"
            className="size-4 shrink-0 opacity-40 grayscale"
          />
          <span className="min-w-0 flex-1 truncate text-secondary-label text-xs font-normal">
            {PROJECT_TITLE}
          </span>
          <span className="ml-auto flex shrink-0 items-center justify-end text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
              <CircleCheckIcon aria-hidden className="size-4 shrink-0" />
              <span role="status">Done</span>
            </span>
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-normal text-secondary-label">
            Update release notes
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">docs/release-notes</span>
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make("claudeAgent")}
            displayName="Nexplore"
            className="size-3.5"
            iconClassName="size-3.5"
          />
        </div>
      </div>
    </div>
  );
}

