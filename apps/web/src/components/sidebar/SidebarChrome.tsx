import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  GitPullRequestIcon,
  InboxIcon,
  ListTreeIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { Link, useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn, isMacPlatform } from "../../lib/utils";
import { useEnvironments } from "../../state/environments";
import { T3Wordmark } from "../T3Wordmark";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  resolveSidebarStageFocusRingOffsetClass,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { useT3TeamSidebarProjectScope } from "~/t3team/t3team-sidebarProjectScopeStore";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "focus-visible:ring-white/90 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white! [:hover,[data-pressed]]:bg-white/15",
          backdropVariant && resolveSidebarStageFocusRingOffsetClass(backdropVariant),
        )}
      />
      <SidebarBrand isElectron={isElectron} onBackdrop={backdropVariant !== null} />
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 hidden rounded-full px-1.5 text-muted-foreground @[15rem]/sidebar-header:inline-flex"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ isElectron, onBackdrop }: { isElectron: boolean; onBackdrop: boolean }) {
  const shouldInsetTitlebarBrand =
    isMacPlatform(navigator.platform) &&
    (isElectron || document.documentElement.classList.contains("wco"));

  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        // Titlebar inset only where native window buttons exist — on the web the brand docks
        // left, flush with the sidebar items below it, instead of reserving phantom control
        // space (see the same rule in `t3team-ProjectSidebarHeader.tsx`). Electron always has
        // native controls; on the web the inset only applies once the installed PWA is running
        // in window-controls-overlay mode (the `.wco` class toggled by windowControlsOverlay.ts).
        shouldInsetTitlebarBrand
          ? "ml-[var(--workspace-titlebar-content-left)]"
          : "md:ml-[calc(var(--sidebar-content-inset)+var(--sidebar-row-content-inset))]",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <T3Wordmark aria-label="T3" className="h-2.5 w-auto shrink-0" />
      <span
        className={cn(
          "-translate-y-px truncate text-sm font-medium tracking-tight",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </Link>
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
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const currentFooterPage = useLocation({
    select: (location) =>
      /^\/settings(?:\/|$)/.test(location.pathname)
        ? "settings"
        : /^\/projects\/[^/]+\/?$/.test(location.pathname)
          ? "project-settings"
          : location.pathname === "/usage"
            ? "usage"
            : location.pathname === "/pull-requests"
              ? "pull-requests"
              : null,
  });
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/pull-requests", search: { involvement: "all", state: "open" } });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  // t3team: the sidebar's project-scope selection, mirrored out of Sidebar.tsx. "My work"
  // follows it (scoped → that project's my-work board, otherwise the global view), and
  // "Backlog" only exists scoped — flattened across projects it loses the hierarchy that IS
  // the view.
  const scopedProjectId = useT3TeamSidebarProjectScope((state) => state.scopedProjectId);
  const handleMyWorkClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void (scopedProjectId === null
      ? navigate({ to: "/t3team/my-work" })
      : navigate({
          to: "/t3team/projects/$projectId",
          params: { projectId: scopedProjectId },
          search: { projectView: "my-work" },
        }));
  }, [isMobile, navigate, scopedProjectId, setOpenMobile]);
  const handleBacklogClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (scopedProjectId === null) {
      return;
    }
    void navigate({
      to: "/t3team/projects/$projectId",
      params: { projectId: scopedProjectId },
      search: { projectView: "backlog" },
    });
  }, [isMobile, navigate, scopedProjectId, setOpenMobile]);
  // t3team: the Team shell is the permanent product shell, so its nav targets exist from every
  // route — including upstream-shell pages like /pull-requests or /settings. Hiding these rows
  // off /t3team/* made "My work" vanish the moment the user opened the PR page.
  const showTeamNav = true;
  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, closeMobileSidebar, navigate]);

  return (
    <>
      {showTeamNav ? (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleMyWorkClick}>
              <InboxIcon />
              <span>My work</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {scopedProjectId !== null ? (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleBacklogClick}>
                <ListTreeIcon />
                <span>Backlog</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      ) : null}
      <SidebarMenu className="flex-row items-center">
        {currentFooterPage ? (
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton onClick={handleBackClick}>
              <ArrowLeftIcon />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          <>
            <SidebarUtilityItem
              icon={<SettingsIcon />}
              label="Settings"
              onClick={handleSettingsClick}
            />
            {pullRequestsSupported ? (
              <SidebarUtilityItem
                icon={<GitPullRequestIcon />}
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
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      {/* The fork's t3team team-nav rows live inside SidebarUtilityMenu (top of
          its render) so they stay visible on every route, matching the fork's
          pre-extraction footer behavior. */}
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
