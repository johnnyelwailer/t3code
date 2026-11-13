import type { CSSProperties, ReactNode } from "react";

import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { isElectron } from "~/env";
import {
  welcomeTitleAlign,
  welcomeTitleBarHeaderClass,
  welcomeTitleTextClass,
} from "./t3team-welcomeTitleBar";
import { T3TEAM_WINDOW_CHROME_SAFE_CLASS } from "~/t3team/t3team-windowChromeSafe";
import { cn, isMacPlatform } from "~/lib/utils";

/**
 * The welcome setup owns the whole window. `narrow` is the phone-width story frame.
 * The footer sits outside the scroll region so Start stays reachable on a short screen.
 */
export function WelcomePageShell({
  children,
  narrow,
  title,
  footer,
  platform,
}: {
  readonly children: ReactNode;
  readonly narrow?: boolean | undefined;
  readonly title?: string | undefined;
  readonly footer?: ReactNode;
  /** Override for tests and screenshots. Defaults to the current navigator platform. */
  readonly platform?: string | undefined;
}) {
  const resolvedPlatform = platform ?? (typeof navigator === "undefined" ? "" : navigator.platform);
  const align = welcomeTitleAlign(resolvedPlatform);
  // Same 90px as useT3TeamMacosTitlebarInsetStyle, from the platform prop so
  // tests and screenshots can opt in without a desktop bridge.
  const macosTitlebarInsetStyle: CSSProperties | undefined = isMacPlatform(resolvedPlatform)
    ? ({ "--workspace-controls-left": "90px" } as CSSProperties)
    : undefined;

  if (narrow) {
    return (
      <div
        className="relative flex min-h-screen flex-col bg-sidebar text-foreground"
        data-nexi-welcome=""
        style={{ width: 390, marginInline: "auto" }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <WelcomeCard>{children}</WelcomeCard>
        </div>
        {footer ? <WelcomeFooter>{footer}</WelcomeFooter> : null}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-sidebar text-foreground"
      data-nexi-welcome=""
      data-welcome-title-align={align}
      style={macosTitlebarInsetStyle}
    >
      <WorkspacePageHeader
        electron={isElectron}
        className={cn(T3TEAM_WINDOW_CHROME_SAFE_CLASS, welcomeTitleBarHeaderClass(align))}
      >
        {title ? <span className={welcomeTitleTextClass(align)}>{title}</span> : null}
      </WorkspacePageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both" data-welcome-scroll="">
        <div className="@container/welcome-page mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <WelcomeCard>{children}</WelcomeCard>
        </div>
      </div>
      {footer ? <WelcomeFooter>{footer}</WelcomeFooter> : null}
    </div>
  );
}

function WelcomeCard({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background px-5 py-6 shadow-lg shadow-black/10 sm:px-10 sm:py-8">
      {children}
    </div>
  );
}

function WelcomeFooter({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className="shrink-0 border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur sm:px-8"
      data-welcome-footer=""
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </div>
  );
}
