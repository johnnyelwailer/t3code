import {
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
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
import { useSidebarPillRowWidth } from "./t3team-SidebarPillRowMeasure";
import { T3TeamSidebarProjectScopePillStack } from "./t3team-SidebarProjectScopePillStack";
import { T3TeamSidebarProjectScopeSiteFailure } from "./t3team-SidebarProjectScopeSiteFailure";
import {
  projectScopeDiscCapacity,
  splitProjectScopePills,
} from "./t3team-sidebarProjectScopePills.logic";

type PillsProps = {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  /** Project keys the reader removed from view: no disc, kept only so they can be brought back. */
  hiddenProjectKeys: ReadonlySet<string>;
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

/**
 * One-click project scope: an "All" disc plus a stack of discs, as many as the row's width
 * fits; the rest sit behind a "+N" disc that searches every project (a search disc when
 * nothing overflows). The discs are the app's own projects in the sidebar's sort order; the
 * Jira projects the app does not have yet surface as add candidates once you search. A site
 * whose project list failed stays visible beside the stack, with a retry.
 */
export function T3TeamSidebarProjectScopePillsView({
  groups,
  addable,
  siteFailures = [],
  onRetrySite,
  activeScopeKey,
  onSelectScope,
  hiddenProjectKeys,
  onProjectContextMenu,
}: PillsProps & {
  addable: ReadonlyArray<JiraCatalogProject>;
  siteFailures?: ReadonlyArray<JiraCatalogSiteFailure>;
  onRetrySite?: (accountId: string) => void;
}) {
  const [ref, width] = useSidebarPillRowWidth();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const empty: ReadonlyArray<SidebarProjectSnapshot> = [];
  const visibleGroups = groups.filter((group) => !hiddenProjectKeys.has(group.projectKey));
  const hiddenGroups = groups.filter((group) => hiddenProjectKeys.has(group.projectKey));
  const { shown, overflow } =
    width === null
      ? { shown: empty, overflow: empty }
      : splitProjectScopePills(visibleGroups, activeScopeKey, projectScopeDiscCapacity(width));

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
        <div ref={ref} className="flex min-w-0 flex-1 items-center overflow-hidden pt-px">
          <T3TeamSidebarProjectScopePillStack
            shown={shown}
            overflow={overflow}
            hidden={hiddenGroups}
            addable={addable}
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
