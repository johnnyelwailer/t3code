import { X } from "lucide-react";

import { ProjectAvatar } from "~/t3team/components/t3team-ProjectAvatar";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

export type CreateProjectPageHeaderEntry = Pick<
  JiraCatalogProject,
  "title" | "key" | "iconUrl" | "siteHost"
>;

/** The add-project page's header row: the project once it is picked, and a close button. */
export function CreateProjectPageHeader({
  entry,
  onClose,
  dismissible,
}: {
  entry: CreateProjectPageHeaderEntry | null;
  onClose: () => void;
  dismissible: boolean;
}) {
  return (
    <div className="relative flex shrink-0 items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
      {entry ? (
        <div className="flex min-w-0 items-center gap-3">
          <ProjectAvatar
            title={entry.title}
            projectKey={entry.key}
            iconUrl={entry.iconUrl}
            className="size-9 shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {entry.title}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {[entry.key, entry.siteHost].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      ) : (
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Add a Jira project</h1>
      )}
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onClose}
        disabled={!dismissible}
        aria-label="Close"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
