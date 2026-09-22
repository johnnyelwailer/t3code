import { FolderIcon } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { ProjectFavicon } from "../ProjectFavicon";
import { TooltipProvider } from "../ui/tooltip";
import { T3TeamSidebarProjectScopeDisc } from "./t3team-SidebarProjectScopeDisc";
import {
  projectScopeDiscCapacity,
  projectScopeDiscDepth,
  selectProjectScopePillGroups,
} from "./t3team-sidebarProjectScopePills.logic";

/** Observed content width of the row, so the disc count follows the sidebar width. */
function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Same props as the thread rows pass, so a disc shows exactly the icon its threads show
// (favicon, chosen icon, or the automatic per-project fallback).
function GroupIcon({ group }: { group: SidebarProjectSnapshot }) {
  return (
    <ProjectFavicon
      environmentId={group.environmentId}
      cwd={group.workspaceRoot}
      projectName={group.title}
      faviconPath={group.faviconPath}
      projectIcon={group.projectIcon}
      className="size-4 shrink-0"
    />
  );
}

/**
 * One-click project scope: an "All" disc plus a stack of recent-project discs, as many as
 * the row's width fits (the rest live in the combobox beside it). Groups arrive in the
 * sidebar's own sort order, so recency is whatever that order says. The selection sits on
 * top of the stack; discs further from it sit further back.
 */
export function T3TeamSidebarProjectScopePills({
  groups,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
}: {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  onProjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
    projectGroup: SidebarProjectSnapshot,
  ) => void;
}) {
  const [ref, width] = useMeasuredWidth();
  const shown = selectProjectScopePillGroups(
    groups,
    activeScopeKey,
    projectScopeDiscCapacity(width),
  );
  // Index 0 is "All"; the selection (or "All") is the top of the pyramid.
  const activeIndex = shown.findIndex((group) => group.projectKey === activeScopeKey) + 1;
  const total = shown.length + 1;
  const disc = (index: number) => projectScopeDiscDepth(index, activeIndex);

  return (
    <TooltipProvider delay={300} closeDelay={0}>
      <div
        ref={ref}
        role="group"
        aria-label="Project scope"
        // Left inset matches the search field's padding above; the vertical inset keeps the
        // lifted selection's top edge inside the clipping box.
        className="flex min-w-0 flex-1 items-center overflow-hidden py-0.5 pl-2"
      >
        <div className="flex items-center">
          <T3TeamSidebarProjectScopeDisc
            label="All projects"
            active={activeIndex === 0}
            {...disc(0)}
            zIndex={total - disc(0).depth}
            first
            onSelect={() => onSelectScope(null)}
          >
            <FolderIcon className="size-4" />
          </T3TeamSidebarProjectScopeDisc>
          {shown.map((group, i) => {
            const index = i + 1;
            return (
              <T3TeamSidebarProjectScopeDisc
                key={group.projectKey}
                label={group.displayName}
                active={index === activeIndex}
                {...disc(index)}
                zIndex={total - disc(index).depth}
                first={false}
                onSelect={() => onSelectScope(group.projectKey)}
                onContextMenu={
                  onProjectContextMenu ? (event) => onProjectContextMenu(event, group) : undefined
                }
              >
                <GroupIcon group={group} />
              </T3TeamSidebarProjectScopeDisc>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
