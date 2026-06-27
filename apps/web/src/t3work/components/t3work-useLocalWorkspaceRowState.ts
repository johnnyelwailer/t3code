import { useCallback, useRef, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { showLocalWorkspaceContextMenu } from "./t3work-localWorkspaceContextMenu";

type UseLocalWorkspaceRowStateInput = {
  project: ProjectShellProject;
  threadCount: number;
  onRenameProject: (id: string, newTitle: string) => void;
  onDeleteProject: (id: string) => void;
};

export function useLocalWorkspaceRowState({
  project,
  threadCount,
  onRenameProject,
  onDeleteProject,
}: UseLocalWorkspaceRowStateInput) {
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

  const workspaceRoot = project.workspace?.rootPath ?? null;

  const showMenu = useCallback(
    async (clientX: number, clientY: number) => {
      await showLocalWorkspaceContextMenu({
        clientX,
        clientY,
        projectTitle: project.title,
        workspaceRoot,
        threadCount,
        onBeginRename: beginRename,
        onRemove: () => onDeleteProject(project.id),
      });
    },
    [beginRename, onDeleteProject, project.id, project.title, threadCount, workspaceRoot],
  );

  const handleContextMenu = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      await showMenu(event.clientX, event.clientY);
    },
    [showMenu],
  );

  const handleOpenMenu = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      await showMenu(Math.round(rect.left + rect.width / 2), Math.round(rect.bottom));
    },
    [showMenu],
  );

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameTitle.trim();
    if (trimmed && trimmed !== project.title) {
      onRenameProject(project.id, trimmed);
    } else {
      setRenameTitle(project.title);
    }
    setIsRenaming(false);
  }, [onRenameProject, project.id, project.title, renameTitle]);

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
