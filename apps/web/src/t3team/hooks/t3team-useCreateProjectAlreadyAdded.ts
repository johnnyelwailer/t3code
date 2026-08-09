import { useCallback, useMemo } from "react";
import type { ExternalProject } from "@t3tools/integrations-core";

import { useExistingProjectForExternalProject } from "./t3team-useExistingProjectForExternalProject";

/**
 * Wires {@link useExistingProjectForExternalProject} into the create-project wizard: derives the
 * external id list from the currently listed projects, and turns a click on an already-added row
 * into "open the existing project, close this wizard" instead of the create flow. Split out of
 * `t3team-CreateProjectDialog.tsx` to stay under that file's additive-guard LOC cap.
 */
export function useCreateProjectAlreadyAdded(input: {
  accountId: string | null;
  projects: ReadonlyArray<ExternalProject>;
  onOpenExistingProject?: ((projectId: string) => void) | undefined;
  onClose: () => void;
}) {
  const { accountId, projects, onOpenExistingProject, onClose } = input;
  const externalProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const alreadyAdded = useExistingProjectForExternalProject({ accountId, externalProjectIds });

  const handleOpenExisting = useCallback(
    (projectId: string) => {
      onOpenExistingProject?.(projectId);
      onClose();
    },
    [onOpenExistingProject, onClose],
  );

  return { alreadyAdded, handleOpenExisting };
}
