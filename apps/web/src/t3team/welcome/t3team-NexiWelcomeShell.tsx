import type { ReactNode } from "react";

import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { isElectron } from "~/env";

/**
 * The welcome setup always owns the whole window: a fixed surface above whichever layout mounts
 * it, so it can never show as a column beside the sidebar. `narrow` is the phone-width story frame.
 */
export function WelcomePageShell({
  children,
  narrow,
  title,
}: {
  readonly children: ReactNode;
  readonly narrow?: boolean | undefined;
  /** Shown in the titlebar strip, where the app shows its page title. */
  readonly title?: string | undefined;
}) {
  if (narrow) {
    return (
      <div
        className="relative min-h-screen bg-sidebar text-foreground"
        data-nexi-welcome=""
        style={{ width: 390, marginInline: "auto" }}
      >
        <div className="px-3 py-4">
          <WelcomeCard>{children}</WelcomeCard>
        </div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-sidebar text-foreground"
      data-nexi-welcome=""
    >
      <WorkspacePageHeader
        electron={isElectron}
        className="justify-center border-b border-border/50 px-4"
      >
        {title ? (
          <span className="text-sm font-medium text-muted-foreground/70">{title}</span>
        ) : null}
      </WorkspacePageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
          <WelcomeCard>{children}</WelcomeCard>
        </div>
      </div>
    </div>
  );
}

function WelcomeCard({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background px-5 py-6 shadow-lg shadow-black/10 sm:px-10 sm:py-9">
      {children}
    </div>
  );
}
