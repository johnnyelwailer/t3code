import type { ProjectShellProject } from "@t3tools/project-context";

import { JiraProjectPicker } from "~/t3team/components/t3team-JiraProjectPicker";
import { Button } from "~/t3team/components/ui/t3team-button";
import { DialogFooter, DialogHeader, DialogTitle } from "~/t3team/components/ui/t3team-dialog";
import { useRepairProjectBinding } from "~/t3team/hooks/t3team-useRepairProjectBinding";
import { CalmError } from "~/t3team/t3team-CalmError";
import { CreateProjectConnectPanel } from "~/t3team/t3team-CreateProjectConnectPanel";
import { JiraProjectDialogShell } from "~/t3team/t3team-JiraProjectDialogShell";

const NO_BOUND_PROJECTS: ReadonlyMap<string, string> = new Map();

/**
 * User-initiated repair path for Defect 1: a project whose work-source binding drifted (or was
 * never persisted) can be reconnected here rather than silently rewritten. Same project list as
 * the add-project dialog, pre-filled from the stored entry when possible — the user still
 * explicitly confirms via "Repair binding".
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
  const { catalogState } = repair;
  const needsConnect = catalogState.connected === false && catalogState.catalog.length === 0;

  const handleConfirm = async () => {
    const next = await repair.confirmRepair();
    if (!next) return;
    onProjectUpdated(next);
    onClose();
  };

  return (
    <JiraProjectDialogShell onClose={onClose} dismissible={!repair.confirming}>
      <DialogHeader>
        <DialogTitle>Repair project binding</DialogTitle>
      </DialogHeader>

      {needsConnect ? (
        <CreateProjectConnectPanel refreshCatalog={catalogState.refresh} />
      ) : (
        <JiraProjectPicker
          catalog={catalogState.catalog}
          // Every project is a valid target here; one another project already uses is refused by
          // the server, and said so below.
          boundProjectIds={NO_BOUND_PROJECTS}
          loading={catalogState.loading}
          error={catalogState.error}
          selectedEntryKey={repair.selectedKey}
          onRefresh={() => void catalogState.refresh()}
          onChoose={({ entry }) => repair.select(entry.entryKey)}
        />
      )}

      {repair.confirmError ? (
        <div className="px-5 pb-3">
          <CalmError compact error={repair.confirmError} action="repairing the project binding" />
        </div>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={repair.confirming}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleConfirm()}
          disabled={!repair.selected || repair.confirming}
        >
          {repair.confirming ? "Repairing..." : "Repair binding"}
        </Button>
      </DialogFooter>
    </JiraProjectDialogShell>
  );
}
