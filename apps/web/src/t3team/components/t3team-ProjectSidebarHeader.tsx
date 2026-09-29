import type { EnvironmentAppearance } from "@t3tools/contracts";

import { isElectron } from "~/env";
import { cn, isMacPlatform } from "~/lib/utils";
import {
  SidebarStageBackdrop,
  useSidebarStageBackdropVariant,
} from "~/components/SidebarStageBackdrop";
import { T3TeamLeftSidebarHeaderToggle } from "~/t3team/t3team-LeftSidebarHeaderToggle";
import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { isNexploreBrand, PackBrandIdentity } from "~/t3team/components/t3team-PackBrandIdentity";

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
    // The titlebar row, not a padded SidebarHeader: it aligns to the window controls.
    <div
      className={cn(
        "group/sidebar-header @container/sidebar-header relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 px-3 md:px-0",
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
      <div
        className={cn(
          "relative z-10 flex h-7 w-fit min-w-0 shrink-0 items-center gap-1.5 overflow-hidden",
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
        {/* Under nexplore the wordmark already reads "nexi", so the label carries only the
            remainder ("Nexi Work" -> "Work"). Any other distribution keeps its own mark and its
            full configured name. Both inherit the wrapper's text color. */}
        <PackBrandIdentity
          appearance={appearance}
          appName={appName}
          markClassName={isNexploreBrand(appearance) ? "h-[0.85rem] -translate-y-px" : "size-5"}
          labelClassName="truncate text-sm font-semibold"
          onBackdrop={onBackdrop}
        />
      </div>
      <SidebarTrigger
        // Over the stage artwork: the media viewer's control-on-imagery treatment, as upstream's
        // SidebarChromeHeader does. The layout classes undo that variant's absolute centring.
        variant={onBackdrop ? "media-navigation" : "ghost"}
        className="relative top-auto z-10 ms-auto mr-[var(--sidebar-content-inset)] shrink-0 translate-y-0"
      />
    </div>
  );
}
