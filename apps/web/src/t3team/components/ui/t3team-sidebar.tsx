import type { ComponentProps } from "react";
import { SidebarTrigger as CoreSidebarTrigger } from "../../../components/ui/sidebar";

export * from "../../../components/ui/sidebar";

const MISSING_SIDEBAR_PROVIDER_ERROR = "useSidebar must be used within a SidebarProvider.";

export function SidebarTrigger(props: ComponentProps<typeof CoreSidebarTrigger>) {
  // Route fallbacks can render t3team headers without the shell; hide the trigger instead of crashing.
  try {
    return CoreSidebarTrigger(props);
  } catch (error) {
    if (error instanceof Error && error.message === MISSING_SIDEBAR_PROVIDER_ERROR) {
      return null;
    }

    throw error;
  }
}
