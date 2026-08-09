import { memo, useCallback } from "react";
import { EllipsisIcon, MessageSquareIcon } from "lucide-react";
import type { ProjectThread } from "~/t3team/t3team-types";
import { SidebarMenuSubButton, SidebarMenuSubItem } from "~/t3team/components/ui/t3team-sidebar";
import { readLocalApi } from "~/localApi";
import { formatRelativeTime, resolveThreadStatusPill } from "./t3team-projectSidebarShared";
import {
  getSidebarSurfaceClassName,
  getSidebarWrappedButtonClassName,
  type SidebarItemState,
} from "./t3team-projectSidebarItemState";
import { useAutoScrollIntoView } from "./t3team-useAutoScrollIntoView";
import { useThreadRowMenuHandlers } from "~/t3team/components/t3team-threadRowMenuHandlers";
import { useThreadRowRename } from "~/t3team/components/t3team-useThreadRowRename";
import {
  ExternalSessionActiveLock,
  ExternalSessionProviderMark,
  isExternalSessionActive,
} from "~/t3team/components/t3team-ExternalSessionThreadMarks";

interface ThreadRowProps {
  thread: ProjectThread;
  variant?: "default" | "issue";
  state: SidebarItemState;
  workspacePath?: string | null;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  wrapWithMenuItem?: boolean;
}

export const ThreadRow = memo(function ThreadRow(props: ThreadRowProps) {
  const {
    thread,
    variant = "default",
    state,
    workspacePath = null,
    onSelect,
    onDelete,
    onRename,
    wrapWithMenuItem = true,
  } = props;
  const {
    isRenaming,
    setIsRenaming,
    renameTitle,
    setRenameTitle,
    inputRef: renameInputRef,
    submit: handleRenameSubmit,
  } = useThreadRowRename({ title: thread.title, onRename });
  const rowRef = useAutoScrollIntoView<HTMLAnchorElement>(state.isOpen);
  const statusPill = resolveThreadStatusPill(thread);
  const externalActive = isExternalSessionActive({
    providerKind: thread.providerKind,
    lastMessageAt: thread.lastMessageAt,
  });

  const openThreadMenu = useCallback(
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

  const { handleContextMenu, handleOpenMenu } = useThreadRowMenuHandlers(openThreadMenu);

  const content = (
    <SidebarMenuSubButton
      ref={rowRef}
      size="sm"
      isActive={state.isSelected}
      className={`group/thread-row-button ${thread.childStatus ? "h-auto min-h-7 py-1" : "h-7"} w-full translate-x-0 cursor-pointer justify-start px-2 text-left select-none focus-visible:ring-1 focus-visible:ring-inset ${getSidebarWrappedButtonClassName(
        state,
      )}`}
      onClick={onSelect}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <ExternalSessionProviderMark
          providerKind={thread.providerKind}
          active={externalActive}
        />
        {variant === "issue" ? (
          <MessageSquareIcon className="size-3 shrink-0 text-muted-foreground/70" />
        ) : null}
        {statusPill && (
          <span
            className={`inline-flex size-1.5 shrink-0 rounded-full ${statusPill.dotClass} ${statusPill.pulse ? "animate-pulse" : ""}`}
            title={
              statusPill.detail ? `${statusPill.label} ${statusPill.detail}` : statusPill.label
            }
          />
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              else if (e.key === "Escape") {
                setRenameTitle(thread.title);
                setIsRenaming(false);
              }
            }}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs">{thread.title}</span>
            {thread.childStatus ? (
              <span
                data-child-status={thread.childStatus}
                className="block truncate text-[10px] text-muted-foreground/75"
              >
                {thread.childStatus}
              </span>
            ) : null}
          </span>
        )}
        <ExternalSessionActiveLock active={externalActive} />
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        <div className="relative flex min-w-12 justify-end pr-1">
          <button
            type="button"
            aria-label={`Thread actions for ${thread.title}`}
            className="absolute top-1/2 right-0 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring group-hover/thread-row-button:opacity-100 group-focus-within/thread-row-button:opacity-100"
            onClick={handleOpenMenu}
          >
            <EllipsisIcon className="size-3.5" />
          </button>
          <span className="pointer-events-none text-[10px] text-muted-foreground/40 transition-opacity duration-150 group-hover/thread-row-button:opacity-0 group-focus-within/thread-row-button:opacity-0">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </div>
      </div>
    </SidebarMenuSubButton>
  );

  if (!wrapWithMenuItem) {
    return (
      <div
        className={`group/menu-sub-item relative w-full ${getSidebarSurfaceClassName(state)}`}
        onContextMenu={handleContextMenu}
      >
        {content}
      </div>
    );
  }

  return (
    <SidebarMenuSubItem
      className={`w-full ${getSidebarSurfaceClassName(state)}`}
      onContextMenu={handleContextMenu}
    >
      {content}
    </SidebarMenuSubItem>
  );
});
