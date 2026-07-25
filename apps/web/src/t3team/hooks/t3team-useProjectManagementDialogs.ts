import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

export function useProjectManagementDialogs(projects: ReadonlyArray<ProjectShellProject>) {
  const [manageRepositoriesProjectId, setManageRepositoriesProjectId] = useState<string | null>(
    null,
  );
  const manageRepositoriesProject = manageRepositoriesProjectId
    ? (projects.find((candidate) => candidate.id === manageRepositoriesProjectId) ?? null)
    : null;

  return {
    manageRepositoriesProject,
    setManageRepositoriesProjectId,
  };
}
