import { useCallback, useRef, useState } from "react";

import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";
import { showProjectContextMenu } from "./t3work-projectSidebarProjectRow.helpers";

export function useProjectSidebarProjectRename({
  project,
  onDeleteProject,
  onManageProjectRecipes,
  onManageProjectRepositories,
  onRenameProject,
}: Pick<
  ProjectRowProps,
  | "project"
  | "onDeleteProject"
  | "onManageProjectRecipes"
  | "onManageProjectRepositories"
  | "onRenameProject"
>) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(project.title);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const beginRename = useCallback(() => {
    setRenameTitle(project.title);
    setIsRenaming(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [project.title]);

  const handleContextMenu = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      await showProjectContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        projectId: project.id,
        projectTitle: project.title,
        onManageProjectRecipes,
        onManageProjectRepositories,
        onDeleteProject,
        onBeginRename: beginRename,
      });
    },
    [beginRename, onDeleteProject, onManageProjectRecipes, onManageProjectRepositories, project],
  );

  const handleOpenMenu = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      await showProjectContextMenu({
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.bottom),
        projectId: project.id,
        projectTitle: project.title,
        onManageProjectRecipes,
        onManageProjectRepositories,
        onDeleteProject,
        onBeginRename: beginRename,
      });
    },
    [beginRename, onDeleteProject, onManageProjectRecipes, onManageProjectRepositories, project],
  );

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameTitle.trim();
    if (trimmed && trimmed !== project.title) {
      onRenameProject(project.id, trimmed);
    } else {
      setRenameTitle(project.title);
    }
    setIsRenaming(false);
  }, [onRenameProject, project, renameTitle]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        handleRenameSubmit();
        return;
      }
      if (event.key === "Escape") {
        setRenameTitle(project.title);
        setIsRenaming(false);
      }
    },
    [handleRenameSubmit, project.title],
  );

  return {
    isRenaming,
    renameTitle,
    renameInputRef,
    setRenameTitle,
    handleContextMenu,
    handleOpenMenu,
    handleRenameSubmit,
    handleRenameKeyDown,
  };
}
