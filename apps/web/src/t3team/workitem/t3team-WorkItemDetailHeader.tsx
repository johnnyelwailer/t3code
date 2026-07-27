import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { readLocalApi } from "~/localApi";
import { Button } from "~/t3team/components/ui/t3team-button";
import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";
import {
  WorkItemBreadcrumb,
  type WorkItemBreadcrumbProps,
} from "~/t3team/workitem/t3team-WorkItemBreadcrumb";

/**
 * Detail view chrome: where you are, and the actions that apply to the whole item.
 *
 * The title deliberately lives in the title band below rather than here. The previous header
 * carried key, status and title, then the body repeated all three — the header now carries
 * location only, which leaves room for the breadcrumb to be genuinely useful.
 */
export function WorkItemDetailHeader({
  breadcrumb,
  externalUrl,
  isRefreshing = false,
  shouldInsetDesktopHeader = false,
  actions,
  onBack,
  onRefresh,
}: {
  readonly breadcrumb: WorkItemBreadcrumbProps;
  readonly externalUrl?: string | undefined;
  readonly isRefreshing?: boolean;
  readonly shouldInsetDesktopHeader?: boolean;
  readonly actions?: ReactNode;
  readonly onBack: () => void;
  readonly onRefresh: () => void;
}) {
  return (
    /*
      The header is its own query container. It spans the whole view — content column plus agent
      panel — so the breadcrumb has to shed segments against the header's width, not the content
      column's. Without a container declared here, the breadcrumb's `@md`/`@xl` rules would have no
      container to resolve against and would silently never match.
    */
    <header
      className={getT3TeamMainContentHeaderClassName({
        className: "@container/workitem-header bg-background/80 backdrop-blur-sm",
        shouldInsetDesktopHeader,
      })}
    >
      <SidebarTrigger className="size-7 shrink-0 md:hidden" />

      <Button size="icon-xs" variant="ghost" onClick={onBack} aria-label="Back">
        <ArrowLeft className="size-4" />
      </Button>

      <WorkItemBreadcrumb {...breadcrumb} className="flex-1" />

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh"
          title="Refresh"
        >
          {isRefreshing ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        </Button>

        {externalUrl ? (
          /*
            `target="_blank"` alone is not enough in the desktop shell, where a bare anchor has no
            window to open into and the click goes nowhere. `shell.openExternal` is how the rest of
            the app leaves the application (ThreadTerminalDrawer, GitActionsControl).

            The href stays real so middle-click, copy-link-address and keyboard activation keep
            working, and modified clicks are left alone. When there is no local API — the plain web
            build — the browser's own `target="_blank"` is already correct, so the handler steps
            aside rather than swallowing the click.
          */
          <Button
            size="icon-xs"
            variant="ghost"
            render={
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  const shell = readLocalApi()?.shell;
                  if (!shell) return;
                  event.preventDefault();
                  void shell.openExternal(externalUrl);
                }}
              />
            }
            aria-label="Open in Jira"
            title="Open in Jira"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        ) : null}

        {actions}
      </div>
    </header>
  );
}
