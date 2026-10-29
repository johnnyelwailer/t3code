import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";
import type { EnvironmentPickerTopProps } from "./t3team-extensionTypes";

/** The distribution's `environmentPickerTop` slot, isolated from the stock picker; nothing without one. */
export function EnvironmentPickerTopSlot(props: EnvironmentPickerTopProps) {
  const EnvironmentPickerTop = mobileExtensions.environmentPickerTop;
  return EnvironmentPickerTop ? (
    <ExtensionBoundary>
      <EnvironmentPickerTop {...props} />
    </ExtensionBoundary>
  ) : null;
}
