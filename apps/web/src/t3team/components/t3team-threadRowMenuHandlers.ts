import { useCallback } from "react";

/**
 * Event plumbing for the row's context menu: right-click opens at the pointer, the ellipsis button
 * opens centred beneath itself. Both stop propagation so the click does not also select the thread.
 *
 * Extracted from the row purely so it stays under the fork's LOC ceiling — the positioning rule is
 * the only thing here, and it is easier to see on its own.
 */
export function useThreadRowMenuHandlers(openThreadMenu: (x: number, y: number) => Promise<void>) {
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
  return { handleContextMenu, handleOpenMenu };
}
