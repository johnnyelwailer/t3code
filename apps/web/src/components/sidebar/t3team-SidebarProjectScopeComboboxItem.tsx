import { FolderIcon, SettingsIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";
import { ComboboxItem } from "../ui/combobox";

export type SidebarProjectScopeItem = { value: string; label: string };

/** One row of the project scope menu: favicon, name, and the per-project settings shortcut. */
export function T3TeamSidebarProjectScopeComboboxItem({
  item,
  project,
  onProjectSettings,
}: {
  item: SidebarProjectScopeItem;
  project: SidebarProjectSnapshot | null;
  onProjectSettings: (event: ReactMouseEvent<HTMLElement>, project: SidebarProjectSnapshot) => void;
}) {
  return (
    <ComboboxItem
      hideIndicator
      value={item}
      className="h-8 min-h-8 py-0 font-medium"
      contentClassName="flex min-w-0 items-center gap-2"
      onContextMenu={(event) => {
        if (project) onProjectSettings(event, project);
      }}
    >
      {project ? (
        <ProjectFavicon
          environmentId={project.environmentId}
          cwd={project.workspaceRoot}
          projectName={project.title}
          faviconPath={project.faviconPath}
          projectIcon={project.projectIcon}
          className="size-4 shrink-0"
        />
      ) : (
        <FolderIcon className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
      {project ? (
        <Button
          size="icon-xs"
          variant="ghost-muted"
          tabIndex={-1}
          aria-hidden="true"
          title={`Project settings for ${project.displayName}`}
          className="ml-auto size-6 [--control-icon-color:currentColor] text-icon-muted focus-visible:bg-accent focus-visible:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            onProjectSettings(event, project);
          }}
        >
          <SettingsIcon className="size-3.5" />
        </Button>
      ) : null}
    </ComboboxItem>
  );
}
