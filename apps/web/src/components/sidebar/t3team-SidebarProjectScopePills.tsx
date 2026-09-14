import { FolderIcon } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { ProjectFavicon } from "../ProjectFavicon";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { selectProjectScopePillGroups } from "./t3team-sidebarProjectScopePills.logic";

const DEFAULT_MAX_PILLS = 4;

/**
 * One-click project scope: an "All" pill plus one favicon pill per recent project group. Sits
 * beside the existing project combobox, which becomes the "more" menu for everything not pinned
 * here. Groups arrive in the sidebar's own sort order, so recency is whatever that order says.
 */
export function T3TeamSidebarProjectScopePills({
  groups,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
  maxPills = DEFAULT_MAX_PILLS,
}: {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  onProjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
    projectGroup: SidebarProjectSnapshot,
  ) => void;
  maxPills?: number;
}) {
  const pinned = selectProjectScopePillGroups(groups, activeScopeKey, maxPills);
  return (
    <TooltipProvider delay={300} closeDelay={0}>
      <div
        role="radiogroup"
        aria-label="Project scope"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
      >
        <ScopePill
          label="All projects"
          active={activeScopeKey === null}
          onSelect={() => onSelectScope(null)}
        >
          <FolderIcon className="size-4 shrink-0" />
        </ScopePill>
        {pinned.map((group) => (
          <ScopePill
            key={group.projectKey}
            label={group.displayName}
            active={activeScopeKey === group.projectKey}
            onSelect={() => onSelectScope(group.projectKey)}
            onContextMenu={
              onProjectContextMenu ? (event) => onProjectContextMenu(event, group) : undefined
            }
          >
            <ProjectFavicon
              environmentId={group.environmentId}
              cwd={group.workspaceRoot}
              projectName={group.title}
              faviconPath={group.faviconPath}
              projectIcon={group.projectIcon}
              className="size-4 shrink-0"
            />
          </ScopePill>
        ))}
      </div>
    </TooltipProvider>
  );
}

function ScopePill({
  label,
  active,
  onSelect,
  onContextMenu,
  children,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  onContextMenu?: ((event: ReactMouseEvent<HTMLElement>) => void) | undefined;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            isActive={active}
            className="shrink-0 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:ring-1 data-[active=true]:ring-sidebar-ring/40"
            onClick={onSelect}
            onContextMenu={onContextMenu}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}
