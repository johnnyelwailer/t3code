import { create } from "zustand";

/**
 * Inline preview panel edges being dragged right now. The hosted browser webview renders outside
 * the panel's subtree (it is positioned over the panel's slot), so the drag state reaches it
 * through this store rather than props. Counted, so one panel ending its drag (or unmounting)
 * cannot release another's.
 */
const usePreviewPanelResizeStore = create<{ readonly activeDrags: number }>(() => ({
  activeDrags: 0,
}));

/** Marks a panel drag as active until the returned release is called (idempotent). */
export function beginPreviewPanelResize(): () => void {
  usePreviewPanelResizeStore.setState((state) => ({ activeDrags: state.activeDrags + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    usePreviewPanelResizeStore.setState((state) => ({ activeDrags: state.activeDrags - 1 }));
  };
}

export function usePreviewPanelResizing(): boolean {
  return usePreviewPanelResizeStore((state) => state.activeDrags > 0);
}
