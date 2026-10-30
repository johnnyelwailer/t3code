import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { useMemo } from "react";

import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";
import type { EnvironmentPickerTopProps } from "./t3team-extensionTypes";
import { selectedProjectFacts } from "./t3team-selectedProjectFacts";

/** The distribution's `environmentPickerTop` slot, isolated from the stock picker; nothing without one. */
export function EnvironmentPickerTopSlot(
  props: Omit<EnvironmentPickerTopProps, "selectedProject"> & {
    readonly selectedProject?: EnvironmentProject | null;
  },
) {
  const EnvironmentPickerTop = mobileExtensions.environmentPickerTop;
  const { selectedProject, ...rest } = props;
  // One object per selection, so a slot may use it as a dependency.
  const facts = useMemo(() => selectedProjectFacts(selectedProject), [selectedProject]);
  return EnvironmentPickerTop ? (
    <ExtensionBoundary>
      <EnvironmentPickerTop {...rest} selectedProject={facts} />
    </ExtensionBoundary>
  ) : null;
}
