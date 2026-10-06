import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SCOPE_DISC_OVERLAP } from "./t3team-sidebarProjectScopePills.logic";

export interface ScopeOverflowEntry {
  readonly key: string;
  readonly label: string;
  /** An add entry is a Jira project that is not in the app yet. */
  readonly kind: "app" | "add";
  readonly icon: ReactNode;
  readonly disabledReason?: string | undefined;
  readonly onSelect: () => void;
}

/** The "+N" disc: the projects that did not fit as discs, one menu click away. */
export function T3TeamSidebarProjectScopeOverflow({
  entries,
  zIndex,
}: {
  entries: ReadonlyArray<ScopeOverflowEntry>;
  zIndex: number;
}) {
  if (entries.length === 0) return null;
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={`${entries.length} more projects`}
            style={{ zIndex, marginLeft: -SCOPE_DISC_OVERLAP }}
            className="relative inline-flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/15 bg-card px-1.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 dark:border-white/15 dark:bg-sidebar-control-surface"
          />
        }
      >
        +{entries.length}
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" className="max-h-80 overflow-y-auto">
        {entries.map((entry) => (
          <MenuItem
            key={entry.key}
            disabled={Boolean(entry.disabledReason)}
            title={entry.disabledReason}
            onClick={entry.onSelect}
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              {entry.icon}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", entry.kind === "add" && "italic")}>
              {entry.label}
            </span>
            {entry.kind === "add" ? (
              <PlusIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            ) : null}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
