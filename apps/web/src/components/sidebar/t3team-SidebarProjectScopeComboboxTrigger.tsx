import { ChevronDownIcon, EllipsisIcon, FolderIcon } from "lucide-react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { ProjectFavicon } from "../ProjectFavicon";
import { ComboboxTrigger } from "../ui/combobox";
import { SidebarMenuButton } from "../ui/sidebar";

/**
 * Trigger of the project scope menu. `compact` is the icon-only "more" button that sits
 * beside the scope pills; otherwise it is the full-width "All projects ▾" row trigger.
 */
export function T3TeamSidebarProjectScopeComboboxTrigger({
  compact,
  scopedGroup,
}: {
  compact: boolean;
  scopedGroup: SidebarProjectSnapshot | null;
}) {
  if (compact) {
    return (
      <ComboboxTrigger
        render={
          <SidebarMenuButton
            size="icon"
            aria-label="More projects"
            className="shrink-0 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          />
        }
      >
        <EllipsisIcon className="size-4 shrink-0" />
      </ComboboxTrigger>
    );
  }
  return (
    <ComboboxTrigger
      render={
        <SidebarMenuButton
          aria-label="Filter threads by project"
          className="min-w-0 flex-1 ps-[calc(var(--sidebar-row-content-inset)-1px)] focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        />
      }
    >
      {scopedGroup ? (
        <span className="flex shrink-0">
          <ProjectFavicon
            environmentId={scopedGroup.environmentId}
            cwd={scopedGroup.workspaceRoot}
            projectName={scopedGroup.title}
            faviconPath={scopedGroup.faviconPath}
            projectIcon={scopedGroup.projectIcon}
            className="size-4"
          />
        </span>
      ) : (
        <FolderIcon className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{scopedGroup?.displayName ?? "All projects"}</span>
      <ChevronDownIcon className="-mr-px size-4 shrink-0" />
    </ComboboxTrigger>
  );
}
