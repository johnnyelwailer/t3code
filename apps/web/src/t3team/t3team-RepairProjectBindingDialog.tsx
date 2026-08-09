import { useState } from "react";
import { Wrench, X } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Card } from "~/t3team/components/ui/t3team-card";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { useRepairProjectBinding } from "~/t3team/hooks/t3team-useRepairProjectBinding";
import { AccountStep, ProjectStep } from "~/t3team/t3team-CreateProjectDialogSteps";

/**
 * User-initiated repair path for Defect 1: a project whose work-source binding drifted (or was
 * never persisted) can be reconnected here rather than silently rewritten. Reuses the create
 * wizard's `AccountStep`/`ProjectStep` and is pre-filled from the stored entry when possible — the
 * user still explicitly confirms via "Repair binding". Shape copied from
 * `t3team-ManageProjectRepositoriesDialog.tsx` (closest precedent: `project`/`onClose`/`onProjectUpdated`).
 */
export function RepairProjectBindingDialog({
  project,
  onClose,
  onProjectUpdated,
}: {
  project: ProjectShellProject;
  onClose: () => void;
  onProjectUpdated: (project: ProjectShellProject) => void;
}) {
  const repair = useRepairProjectBinding(project);
  const [projectQuery, setProjectQuery] = useState("");
  const query = projectQuery.trim().toLowerCase();
  const filteredProjects = repair.projects.filter((candidate) =>
    `${candidate.title} ${candidate.key ?? ""}`.toLowerCase().includes(query),
  );

  const handleConfirm = async () => {
    const next = await repair.confirmRepair();
    if (!next) return;
    onProjectUpdated(next);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      <Card className="flex h-full w-full max-w-lg flex-col overflow-hidden sm:h-[min(36rem,calc(100dvh-2rem))]">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Repair project binding</h2>
          </div>
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </Button>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">
              This project's Jira connection is broken or missing. Reconnect the site and project it
              should read from below.
            </p>

            {repair.confirmError ? (
              <T3TeamErrorState error={repair.confirmError} action="repairing the project binding" />
            ) : null}

            {!repair.selectedAccount ? (
              <AccountStep
                accounts={repair.accounts}
                selectedAccount={repair.selectedAccount}
                onSelectAccount={(account) => {
                  repair.setSelectedAccount(account);
                  void repair.loadProjects(account);
                }}
                loading={repair.loadingAccounts}
              />
            ) : (
              <ProjectStep
                filteredProjects={filteredProjects}
                selectedProject={repair.selectedProject}
                projectQuery={projectQuery}
                setProjectQuery={setProjectQuery}
                onSelectProject={repair.setSelectedProject}
                loading={repair.loadingProjects}
              />
            )}
          </div>
        </ScrollArea>

        <footer className="border-t border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={onClose} disabled={repair.confirming}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={!repair.selectedProject || repair.confirming}
            >
              {repair.confirming ? "Repairing..." : "Repair binding"}
            </Button>
          </div>
        </footer>
      </Card>
    </div>
  );
}
