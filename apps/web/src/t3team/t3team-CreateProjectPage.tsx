import { useEffect, type ReactNode } from "react";

import {
  CreateProjectPageHeader,
  type CreateProjectPageHeaderEntry,
} from "~/t3team/t3team-CreateProjectPageHeader";

/**
 * The full-screen frame for `/t3team/new`: the sidebar stays, this fills the rest of the main pane
 * (no Dialog primitive, so Esc is handled here instead). Same backdrop art as the first-run
 * welcome surface — both are "set up your workspace" moments.
 */
export function CreateProjectPage({
  entry,
  onClose,
  dismissible = true,
  footer,
  children,
}: {
  entry: CreateProjectPageHeaderEntry | null;
  onClose: () => void;
  /** False while a create is running: Esc and the close button do nothing then. */
  dismissible?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissible, onClose]);

  return (
    <div
      data-testid="create-project-page"
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 t3team-welcome-glow opacity-80" />
      <div className="pointer-events-none absolute inset-0 t3team-welcome-wash" />

      <CreateProjectPageHeader entry={entry} onClose={onClose} dismissible={dismissible} />

      <div className="relative mx-auto flex w-full min-h-0 max-w-6xl flex-1 flex-col px-4 pb-4 sm:px-6">
        {children}
      </div>

      {footer}
    </div>
  );
}
