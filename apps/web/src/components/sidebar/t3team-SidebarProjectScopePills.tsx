import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import { useProjects } from "~/state/entities";
import {
  boundCatalogEntryKeys,
  unaddedCatalogProjects,
  type JiraCatalogProject,
  type JiraCatalogSiteFailure,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import { useJiraProjectCatalog } from "~/t3team/hooks/t3team-useJiraProjectCatalog";

import { TooltipProvider } from "../ui/tooltip";
import { T3TeamSidebarProjectScopePillStack } from "./t3team-SidebarProjectScopePillStack";
import { T3TeamSidebarProjectScopeSiteFailure } from "./t3team-SidebarProjectScopeSiteFailure";
import { buildScopePillItems, type ScopePillItem } from "./t3team-sidebarProjectScopePills.items";
import {
  projectScopeDiscCapacity,
  splitProjectScopePills,
} from "./t3team-sidebarProjectScopePills.logic";

type PillsProps = {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  onProjectContextMenu?:
    | ((
        event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
        projectGroup: SidebarProjectSnapshot,
      ) => void)
    | undefined;
};

/**
 * Pills plus the user's Jira projects the app does not have yet. The catalog and the app's
 * own bindings are read here, so the sidebar passes the same props as before.
 */
export function T3TeamSidebarProjectScopePills(props: PillsProps) {
  const { projects: catalog, siteFailures, retrySite } = useJiraProjectCatalog();
  const appProjects = useProjects();
  const addable = useMemo(
    () => unaddedCatalogProjects(catalog, boundCatalogEntryKeys(appProjects)),
    [catalog, appProjects],
  );
  return (
    <T3TeamSidebarProjectScopePillsView
      {...props}
      addable={addable}
      siteFailures={siteFailures}
      onRetrySite={retrySite}
    />
  );
}

/** `null` until the row has been measured, so a 0-width first paint does not flash every site into +N. */
function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
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

/**
 * One-click project scope: an "All" disc plus a stack of discs, as many as the row's width
 * fits; the rest sit behind a "+N" disc that searches every project (a search disc when
 * nothing overflows). App projects come first in the sidebar's own sort
 * order, then dashed "add" discs for Jira projects the app does not have yet. A site whose
 * project list failed stays visible beside the stack, with a retry.
 */
export function T3TeamSidebarProjectScopePillsView({
  groups,
  addable,
  siteFailures = [],
  onRetrySite,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
}: PillsProps & {
  addable: ReadonlyArray<JiraCatalogProject>;
  siteFailures?: ReadonlyArray<JiraCatalogSiteFailure>;
  onRetrySite?: (accountId: string) => void;
}) {
  const [ref, width] = useMeasuredWidth();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => buildScopePillItems(groups, addable), [groups, addable]);
  const empty: ReadonlyArray<ScopePillItem> = [];
  const { shown, overflow } =
    width === null
      ? { shown: empty, overflow: empty }
      : splitProjectScopePills(items, activeScopeKey, projectScopeDiscCapacity(width));

  return (
    <TooltipProvider delay={300} closeDelay={0}>
      <div
        ref={rowRef}
        role="group"
        aria-label="Project scope"
        // Left inset matches the search field's padding above. Failed sites sit outside the
        // clipping box so the error mark is not cut off by the disc stack.
        className="flex min-w-0 flex-1 items-center gap-1 py-0.5 pl-2"
      >
        <div ref={ref} className="flex min-w-0 flex-1 items-center overflow-hidden">
          <T3TeamSidebarProjectScopePillStack
            shown={shown}
            overflow={overflow}
            activeScopeKey={activeScopeKey}
            onSelectScope={onSelectScope}
            onProjectContextMenu={onProjectContextMenu}
            pickerAnchor={rowRef}
          />
        </div>
        {siteFailures.map((failure) => (
          <T3TeamSidebarProjectScopeSiteFailure
            key={failure.accountId}
            failure={failure}
            onRetry={() => onRetrySite?.(failure.accountId)}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
