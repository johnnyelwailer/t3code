import { memo, useCallback, useRef, useState } from "react";
import { EllipsisIcon, MessageSquareIcon } from "lucide-react";
import type { ProjectThread } from "~/t3work/t3work-types";
import { SidebarMenuSubButton, SidebarMenuSubItem } from "~/t3work/components/ui/t3work-sidebar";
import { readLocalApi } from "~/localApi";
import { formatRelativeTime, resolveThreadStatusPill } from "./t3work-projectSidebarShared";

interface ThreadRowProps {
  thread: ProjectThread;
  variant?: "default" | "issue";
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

export const ThreadRow = memo(function ThreadRow(props: ThreadRowProps) {
  const { thread, variant = "default", isActive, onSelect, onDelete, onRename } = props;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(thread.title);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const statusPill = resolveThreadStatusPill(thread);

  const openThreadMenu = useCallback(
    async (x: number, y: number) => {
      const api = readLocalApi();
      if (!api) return;

      const action = await api.contextMenu.show(
        [
          { id: "rename", label: "Rename thread" },
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
        const confirmed = await api.dialogs.confirm(`Delete thread "${thread.title}"?`);
        if (confirmed) onDelete();
      } else if (action === "copy-thread-id") {
        void navigator.clipboard.writeText(thread.id);
      }
    },
    [onDelete, thread],
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      await openThreadMenu(e.clientX, e.clientY);
    },
    [openThreadMenu],
  );

  const handleOpenMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      await openThreadMenu(Math.round(rect.left + rect.width / 2), Math.round(rect.bottom));
    },
    [openThreadMenu],
  );

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameTitle.trim();
    if (trimmed && trimmed !== thread.title) onRename(trimmed);
    else setRenameTitle(thread.title);
    setIsRenaming(false);
  }, [renameTitle, thread.title, onRename]);

  return (
    <SidebarMenuSubItem className="w-full" onContextMenu={handleContextMenu}>
      <SidebarMenuSubButton
        size="sm"
        isActive={isActive}
        className={`group/thread h-7 w-full translate-x-0 cursor-pointer justify-start px-2 text-left select-none ${
          variant === "issue" ? "rounded-md bg-muted/25 hover:bg-accent/70" : ""
        }`}
        onClick={onSelect}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {variant === "issue" ? (
            <MessageSquareIcon className="size-3 shrink-0 text-muted-foreground/70" />
          ) : null}
          {statusPill && (
            <span
              className={`inline-flex size-1.5 shrink-0 rounded-full ${statusPill.dotClass} ${statusPill.pulse ? "animate-pulse" : ""}`}
              title={statusPill.label}
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
            <span className="min-w-0 flex-1 truncate text-xs">{thread.title}</span>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`Thread actions for ${thread.title}`}
            className="inline-flex size-4 cursor-pointer items-center justify-center rounded text-muted-foreground/55 opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground group-hover/thread:opacity-100"
            onClick={handleOpenMenu}
          >
            <EllipsisIcon className="size-3" />
          </button>
          <span className="text-[10px] text-muted-foreground/40">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
});
