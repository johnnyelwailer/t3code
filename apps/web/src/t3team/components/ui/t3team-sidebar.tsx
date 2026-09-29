/* oxlint-disable eslint/no-restricted-imports -- Existing merged lint debt; keep green while preserving behavior. */
import type { ComponentProps } from "react";
import { SidebarTrigger as CoreSidebarTrigger } from "../../../components/ui/sidebar";
import { cn } from "~/lib/utils";

export * from "../../../components/ui/sidebar";

// Upstream dropped its (then unused) SidebarSeparator; the t3team project sidebar still splits
// its footer from the lists with one. It draws in the sidebar's own border colour, which the
// generic Separator does not offer, so it is a plain rule rather than a restyled Separator.
export function SidebarSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn("mx-2 h-px shrink-0 bg-sidebar-border", className)}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      {...props}
    />
  );
}

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
