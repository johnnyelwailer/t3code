import { ArrowLeftIcon, ChartNoAxesColumnIcon, SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn, isMacPlatform } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import { T3Wordmark } from "../T3Wordmark";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  type SidebarStageBackdropVariant,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarConnectSignInPill } from "./t3team-SidebarConnectSignInPill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { T3TeamSidebarWorkNavItems } from "~/t3team/components/t3team-SidebarWorkNav";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const packAppearance = useT3TeamPackAppearance();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
    // A packaged distribution's stage label is its channel ("Alpha"), so pack art is selected by
    // theme id — without this the nexplore art only ever appeared in dev/nightly builds.
    packAppearance?.themeId,
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      {/* One visible line: the pill wraps onto the clipped second line once it no longer fits.
          The padding keeps the brand's focus ring inside the clip. */}
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <SidebarBrand isElectron={isElectron} backdropVariant={backdropVariant} />
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
      <SidebarTrigger
        // Over the stage artwork: the media viewer's control-on-imagery treatment.
        variant={backdropVariant ? "media-navigation" : "ghost"}
        aria-label="Toggle main sidebar"
        // t3team: the trigger stays visible on desktop, docked right after the brand.
        className="relative top-auto z-10 ms-auto mr-[var(--sidebar-content-inset)] translate-y-0"
      />
    </div>
  );
});

export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex">
        <SidebarBrandMark onBackdrop={false} />
      </div>
    </div>
  );
}

function SidebarBrand({
  isElectron,
  backdropVariant,
}: {
  isElectron: boolean;
  backdropVariant: SidebarStageBackdropVariant | null;
}) {
  const onBackdrop = backdropVariant !== null;
  /**
   * `dev` and `nightly` art are dark in both modes, so white always reads over them. The nexplore
   * grounds are palette-driven (Orange in day, Blau in night), so its label colour ships with the
   * ground as `--stage-nx-label` — changing that palette must not mean editing this component.
   */
  const backdropLabelClass =
    backdropVariant === "nexplore" ? "text-(--stage-nx-label)" : "text-white";
  const backdropMutedLabelClass =
    backdropVariant === "nexplore" ? "text-(--stage-nx-label) opacity-70" : "text-white/70";
  const shouldInsetTitlebarBrand =
    isMacPlatform(navigator.platform) &&
    (isElectron || document.documentElement.classList.contains("wco"));

  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 hidden h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        // Titlebar inset only where native window buttons exist — on the web the brand docks
        // left, flush with the sidebar items below it, instead of reserving phantom control
        // space (see the same rule in `t3team-ProjectSidebarHeader.tsx`). Electron always has
        // native controls; on the web the inset only applies once the installed PWA is running
        // in window-controls-overlay mode (the `.wco` class toggled by windowControlsOverlay.ts).
        shouldInsetTitlebarBrand
          ? "ml-[var(--workspace-controls-left)]"
          : "md:ml-[calc(var(--sidebar-content-inset)+var(--sidebar-row-content-inset))]",
        onBackdrop ? backdropLabelClass : "text-foreground",
      )}
      to="/"
    >
      <SidebarBrandMark mutedLabelClass={backdropMutedLabelClass} onBackdrop={onBackdrop} />
    </Link>
  );
}

function SidebarBrandMark({
  onBackdrop,
  mutedLabelClass = "text-white/70",
}: {
  onBackdrop: boolean;
  /** t3team: the nexplore stage art ships its own label colour; see `SidebarBrand`. */
  mutedLabelClass?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <T3Wordmark aria-label="T3" className="h-[1cap] w-auto shrink-0" />
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? mutedLabelClass : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </span>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const pullRequestsSupported = usePullRequestsSupported();
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handlePullRequestsClick = () => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  };
  const handleSettingsClick = () => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  };

  const handleUsageClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  };

  const handleBackClick = () => {
    closeMobileSidebar();
    void navigateToMainApp();
  };

  return (
    <>
      <SidebarMenu className="flex-row items-center">
        {/* t3team: the Team shell's work surfaces, reachable from every route — including
            upstream-shell pages like /pull-requests or /settings. */}
        {isOnUtilityPage ? (
          <>
            <T3TeamSidebarWorkNavItems />
            <SidebarMenuItem className="min-w-0 flex-1">
              <SidebarMenuButton onClick={handleBackClick}>
                <ArrowLeftIcon />
                <span>Back</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        ) : (
          <>
            <SidebarUtilityItem
              icon={<SettingsIcon />}
              label="Settings"
              onClick={handleSettingsClick}
            />
            <T3TeamSidebarWorkNavItems />
            {pullRequestsSupported ? (
              <SidebarUtilityItem
                icon={<PullRequestGlyph.pullRequest />}
                label="Pull Requests"
                onClick={handlePullRequestsClick}
              />
            ) : null}
            <SidebarUtilityItem
              icon={<ChartNoAxesColumnIcon />}
              label="Usage"
              onClick={handleUsageClick}
            />
          </>
        )}
        <SidebarUpdatePill />
      </SidebarMenu>
    </>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <SidebarProviderUpdatePill />
      <SidebarConnectSignInPill />
      <SidebarUpdateArchitectureWarning />
      {/* The fork's t3team work-nav items (My work, Backlog) sit inline in
          SidebarUtilityMenu's icon row so they stay visible on every route. */}
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
