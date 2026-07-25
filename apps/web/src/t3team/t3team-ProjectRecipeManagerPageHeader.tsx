import { ArrowLeft, BookOpenCheck } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { Button } from "~/t3team/components/ui/t3team-button";
import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";

export function ProjectRecipeManagerPageHeader({
  project,
  shouldInsetDesktopHeader = false,
  onBack,
}: {
  readonly project: ProjectShellProject;
  readonly shouldInsetDesktopHeader?: boolean;
  readonly onBack: () => void;
}) {
  return (
    <header
      className={getT3TeamMainContentHeaderClassName({
        className: "bg-gradient-to-b from-background to-muted/15",
        shouldInsetDesktopHeader,
      })}
    >
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onBack}
        aria-label="Back to project dashboard"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <BookOpenCheck className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <h2 className="min-w-0 truncate text-sm font-medium">Manage recipes</h2>
        <span className="truncate text-xs text-muted-foreground/80">{project.title}</span>
      </div>
    </header>
  );
}
