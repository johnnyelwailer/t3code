import type { EnvironmentAppearance } from "@t3tools/contracts";

import { isElectron } from "~/env";
import { cn, isMacPlatform } from "~/lib/utils";
import {
  SidebarStageBackdrop,
  useSidebarStageBackdropVariant,
} from "~/components/SidebarStageBackdrop";
import { T3TeamLeftSidebarHeaderToggle } from "~/t3team/t3team-LeftSidebarHeaderToggle";
import { SidebarHeader, SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { T3TeamNexiWordmark } from "~/t3team/t3team-NexiWordmark";
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
/**
 * Drops a leading "Nexi" from the app name, because the wordmark beside it already says it —
 * "Nexi Work" reads as `nexi Work`, not `nexi Nexi Work`. Derived rather than hardcoded so a
 * differently-named distribution still shows its full name instead of losing its first word.
 */
function brandSuffixLabel(appName: string): string {
  const remainder = appName.replace(/^nexi\s+/i, "").trim();
  return remainder.length > 0 ? remainder : appName;
}

/** The nexi wordmark is nexplore's own asset, so only that distribution may replace the mark. */
const NEXPLORE_THEME_ID = "nexplore";

export function ProjectSidebarHeader({ appearance, appName }: ProjectSidebarHeaderProps) {
  const backdropVariant = useSidebarStageBackdropVariant();
  const onBackdrop = backdropVariant !== null;
  const isNexploreDistribution = appearance?.themeId === NEXPLORE_THEME_ID;
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
          "relative z-10",
          !isElectron &&
            "md:ml-[calc(var(--sidebar-content-inset)+var(--sidebar-row-content-inset))]",
          isElectron && "md:hidden",
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
        {/*
          Aspect from the asset's 59.334x21.029 viewBox, so the wordmark never distorts.

          `-translate-y-px` optically centres it against the label. The row is already
          `items-center`, but that centres the wordmark's BOX while its letterforms are not
          centred inside it: the lowercase mass spans y 4.57-20.85 of a 21.029 box, so its visual
          centre sits ~2.2 units (~1.4px at this size) below the box centre, which reads as the
          label sitting too high. Nudging the wordmark up instead of the label down keeps the text
          on its own baseline.
        */}
        {isNexploreDistribution ? (
          <T3TeamNexiWordmark className="h-[0.85rem] w-auto shrink-0 -translate-y-px" />
        ) : (
          <T3TeamPackBrandImage
            brand={appearance?.brand}
            kind="mark"
            className="size-5 shrink-0"
            onBackdrop={onBackdrop}
          />
        )}
        {/* Under nexplore the wordmark already reads "nexi", so the label carries only the
            remainder ("Nexi Work" -> "Work"). Any other distribution keeps its own mark and its
            full configured name. Both inherit the wrapper's text color. */}
        <span className="truncate text-sm font-semibold">
          {isNexploreDistribution ? brandSuffixLabel(appName) : appName}
        </span>
      </div>
    </SidebarHeader>
  );
}
