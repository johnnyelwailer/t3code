import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";

/** The distribution's `environmentPickerTop` slot, isolated from the stock picker; nothing without one. */
export function EnvironmentPickerTopSlot(props: { readonly close: () => void }) {
  const EnvironmentPickerTop = mobileExtensions.environmentPickerTop;
  return EnvironmentPickerTop ? (
    <ExtensionBoundary>
      <EnvironmentPickerTop close={props.close} />
    </ExtensionBoundary>
  ) : null;
}
