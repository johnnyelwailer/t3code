import type { EnvironmentAppearance } from "@t3tools/contracts";

import { isElectron } from "~/env";
import { cn, isMacPlatform } from "~/lib/utils";
import {
  SidebarStageBackdrop,
  useSidebarStageBackdropVariant,
} from "~/components/SidebarStageBackdrop";
import { T3TeamLeftSidebarHeaderToggle } from "~/t3team/t3team-LeftSidebarHeaderToggle";
import { SidebarHeader, SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { T3TeamPackBrandImage } from "~/t3team/t3team-PackBrandImage";

type ProjectSidebarHeaderProps = {
  appearance: EnvironmentAppearance | undefined;
  appName: string;
};

export function resolveProjectSidebarBrandInset(input: {
  isMac: boolean;
  isDesktop: boolean;
  isWindowControlsOverlay: boolean;
}): string {
  if (input.isMac && input.isDesktop) return "ml-[var(--workspace-controls-left)]";
  if (input.isMac && input.isWindowControlsOverlay) {
    return "ml-[var(--workspace-titlebar-content-left)]";
  }
  return "md:ml-[calc(var(--sidebar-content-inset)+var(--sidebar-row-content-inset))]";
}

/**
 * Team-shell parity header for upstream's `SidebarChromeHeader`: same
 * `--workspace-topbar-height` sizing, `@container/sidebar-header`, drag-region
 * handling, and native-titlebar-safe inset — with the Team's own pack brand
 * mark + configurable app name instead of the T3 wordmark, plus a
 * pack-configurable background layer that sits above the nightly/dev stage
 * backdrop so a pack's own background always wins when both are present.
 */
export function ProjectSidebarHeader({ appearance, appName }: ProjectSidebarHeaderProps) {
  const backdropVariant = useSidebarStageBackdropVariant();
  const onBackdrop = backdropVariant !== null;
  const brandInsetClass = resolveProjectSidebarBrandInset({
    isMac: isMacPlatform(navigator.platform),
    isDesktop: isElectron,
    isWindowControlsOverlay: document.documentElement.classList.contains("wco"),
  });

  return (
    <SidebarHeader
      className={cn(
        "group/sidebar-header @container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      {/* Pack-configurable background; `--t3team-sidebar-header-background` defaults to
          transparent so the stage backdrop (or bare header) shows through untouched
          until a pack sets a color, gradient, or image via `background`. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: "var(--t3team-sidebar-header-background, transparent)" }}
      />
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          onBackdrop &&
            "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
        )}
      />
      <div
        className={cn(
          "relative z-10 flex h-7 w-fit min-w-0 shrink-0 items-center gap-1.5 overflow-hidden",
          // Only macOS needs a left inset for native traffic lights. Windows and
          // Linux place native controls on the right, so the brand can align with
          // the sidebar content. On the web, reserve space only for WCO mode.
          brandInsetClass,
          onBackdrop ? "text-white" : "text-sidebar-foreground",
        )}
      >
        <T3TeamPackBrandImage brand={appearance?.brand} kind="mark" className="size-5 shrink-0" />
        {/* Inherits the wrapper's text color (white on backdrop, sidebar-foreground
            otherwise) — the app name is the Team header's primary label, unlike
            upstream's secondary "Code" caption next to a standalone wordmark. */}
        <span className="truncate text-sm font-semibold">{appName}</span>
      </div>
      {/* `pr-2` matches the icon column's right inset below the header
          (e.g. `SidebarGroup` content, project-row hover actions), since the
          header itself drops horizontal padding at `md:px-0`. */}
      <div className="relative z-10 ml-auto flex items-center pr-2">
        <T3TeamLeftSidebarHeaderToggle surface="banner" />
      </div>
    </SidebarHeader>
  );
}
