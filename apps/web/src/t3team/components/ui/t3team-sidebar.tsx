/* oxlint-disable eslint/no-restricted-imports, shadcn/no-restyle -- Existing merged lint debt; keep green while preserving behavior. */
import type { ComponentProps } from "react";
import { SidebarTrigger as CoreSidebarTrigger } from "../../../components/ui/sidebar";
import { Separator } from "../../../components/ui/separator";
import { cn } from "~/lib/utils";

export * from "../../../components/ui/sidebar";

// Upstream dropped its (then unused) SidebarSeparator; the t3team project sidebar still splits
// its footer from the lists with one.
export function SidebarSeparator({ className, ...props }: ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("mx-2 w-auto! bg-sidebar-border", className)}
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
