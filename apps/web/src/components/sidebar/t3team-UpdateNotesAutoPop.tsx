import { useEffect } from "react";

import { useSidebarVisibility } from "../ui/sidebar";

/** Opens an update's notes once, and only while the sidebar that holds them is shown. */
export function UpdateNotesAutoPop({ onPop }: { readonly onPop: () => void }) {
  const shown = useSidebarVisibility();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens the popover after the sidebar shows; the pop is remembered in browser storage
  useEffect(() => {
    if (shown) onPop();
  }, [shown, onPop]);
  return null;
}
