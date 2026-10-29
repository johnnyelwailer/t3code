import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";

/** The distribution's `newTaskTop` slot, isolated from the stock New task screen; nothing without one. */
export function NewTaskTopSlot() {
  const NewTaskTop = mobileExtensions.newTaskTop;
  return NewTaskTop ? (
    <ExtensionBoundary>
      <NewTaskTop />
    </ExtensionBoundary>
  ) : null;
}
