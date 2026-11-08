import { Platform } from "react-native";

import { mobileExtensions } from "./t3team-extensions";
import type { WorkspaceExtraTab } from "./t3team-extensionTypes";

/**
 * The distribution's extra workspace tab, or null: stock builds, iOS and a slot that returns null.
 * The slot and the platform are fixed for the process, so the hook order is stable.
 */
export function useWorkspaceExtraTab(): WorkspaceExtraTab | null {
  const slot = mobileExtensions.workspaceTab;
  return Platform.OS === "android" && slot ? slot.useTab() : null;
}
