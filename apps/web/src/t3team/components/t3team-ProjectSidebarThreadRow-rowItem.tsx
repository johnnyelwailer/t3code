import { memo, useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ProjectThread } from "~/t3team/t3team-types";
import { readLocalApi } from "~/localApi";
import { type SidebarItemState } from "./t3team-projectSidebarItemState";
import { ThreadRow } from "./t3team-ProjectSidebarThreadRow";

export function useThreadRowContextMenu({
  thread,
  workspacePath,
  onDelete,
  setRenameTitle,
  setIsRenaming,
  renameInputRef,
}: {
  thread: ProjectThread;
  workspacePath: string | null;
  onDelete: () => void;
  setRenameTitle: Dispatch<SetStateAction<string>>;
  setIsRenaming: Dispatch<SetStateAction<boolean>>;
  renameInputRef: RefObject<HTMLInputElement | null>;
}) {
  return useCallback(
    async (x: number, y: number) => {
      const api = readLocalApi();
      if (!api) return;

      const action = await api.contextMenu.show(
        [
          { id: "rename", label: "Rename thread" },
          { id: "copy-path", label: "Copy Path" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          { id: "delete", label: "Delete", destructive: true },
        ],
        { x, y },
      );

      if (action === "rename") {
        setRenameTitle(thread.title);
        setIsRenaming(true);
        requestAnimationFrame(() => {
          renameInputRef.current?.focus();
          renameInputRef.current?.select();
        });
      } else if (action === "delete") {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (confirmed) {
          await onDelete();
        }
      } else if (action === "copy-thread-id") {
        void navigator.clipboard.writeText(thread.id);
      } else if (action === "copy-path") {
        if (workspacePath) {
          void navigator.clipboard.writeText(workspacePath);
        }
      }
    },
    [onDelete, thread, workspacePath],
  );
}

/**
 * Memo barrier for `ThreadRow` in the Work-lens lists.
 *
 * `ThreadRow` is `memo`-ized, but its list callers used to hand it a fresh
 * `state` object and fresh `onSelect`/`onDelete`/`onRename` closures on every
 * render of the list. Because those props changed identity on each render, the
 * row's `memo` never bailed out and selecting a thread re-rendered the ENTIRE
 * list (measured: every visible row, ~2.4 s of cascaded effect chains).
 *
 * This wrapper receives only referentially-stable props: the thread object, a
 * primitive `isSelected`, and the stable list handlers. It builds the per-row
 * `state` and closures inside, so a row re-renders only when its own selection
 * state changes — not when a sibling thread is selected.
 */
export const ProjectSidebarThreadRowItem = memo(function ProjectSidebarThreadRowItem(props: {
  thread: ProjectThread;
  isSelected: boolean;
  workspacePath?: string | null;
  variant?: "default" | "issue";
  wrapWithMenuItem?: boolean;
  projectId: string;
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
}) {
  const {
    thread,
    isSelected,
    workspacePath = null,
    variant,
    wrapWithMenuItem,
    projectId,
    onSelectThread,
    onDeleteThread,
    onRenameThread,
  } = props;
  const state: SidebarItemState = { isSelected, isOpen: isSelected };
  return (
    <ThreadRow
      thread={thread}
      {...(variant ? { variant } : {})}
      state={state}
      workspacePath={workspacePath}
      onSelect={() => onSelectThread(projectId, thread.id)}
      onDelete={() => onDeleteThread(thread.id)}
      onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
      {...(wrapWithMenuItem === undefined ? {} : { wrapWithMenuItem })}
    />
  );
});
