/**
 * Presentational body of the linked-repositories dialog: help text, the no-main (or adopted
 * workspace) banner, and the linked rows with a per-row main marker. The live dialog wraps
 * this around the repository picker; stories and tests render it with a static list so every
 * state can be asserted and captured without GitHub discovery.
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";

import {
  LinkedRepositoriesHelp,
  LinkedRepositoriesWorkspaceBanner,
} from "~/t3team/components/t3team-LinkedRepositoriesHelp";
import { LinkedRepositoryRows } from "~/t3team/components/t3team-LinkedRepositoryRows";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Card } from "~/t3team/components/ui/t3team-card";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";

export type LinkedRepositoriesDialogViewProps = {
  readonly projectTitle: string;
  readonly linkedUrls: ReadonlyArray<string>;
  readonly mainRepositoryUrl: string | null;
  readonly adoptedWorkspace?: boolean | undefined;
  readonly onMakeMain: (url: string) => void;
  readonly onUnlink?: ((url: string) => void) | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly onSave?: (() => void) | undefined;
  readonly saving?: boolean | undefined;
  readonly saved?: boolean | undefined;
  readonly dirty?: boolean | undefined;
  readonly saveError?: unknown;
  readonly pendingMainUrl?: string | null | undefined;
  readonly mainPending?: boolean | undefined;
  readonly mainError?: { readonly url: string | null; readonly message: string } | null | undefined;
  readonly onRetryMain?: (() => void) | undefined;
  readonly children?: ReactNode;
  /** When false, hide main-repository help, banner and markers. */
  readonly showMainRepository?: boolean | undefined;
};

export function LinkedRepositoriesDialogView({
  projectTitle,
  linkedUrls,
  mainRepositoryUrl,
  adoptedWorkspace = false,
  onMakeMain,
  onUnlink,
  onClose,
  onSave,
  saving = false,
  saved = false,
  dirty = false,
  saveError,
  pendingMainUrl,
  mainPending = false,
  mainError = null,
  onRetryMain,
  children,
  showMainRepository = true,
}: LinkedRepositoriesDialogViewProps) {
  return (
    <Card
      role="dialog"
      aria-label="Linked repositories"
      className="flex h-full w-full max-w-6xl flex-col overflow-hidden sm:h-[calc(100dvh-4rem)]"
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-base font-semibold">Linked repositories</h2>
          <p className="truncate text-xs text-muted-foreground">
            {showMainRepository
              ? `For ${projectTitle || "this project"}`
              : `Code, PRs and branches for ${projectTitle || "this project"} come from these.`}
          </p>
          {showMainRepository ? <LinkedRepositoriesHelp /> : null}
        </div>
        {onClose ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={saving || mainPending}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      {showMainRepository && mainRepositoryUrl === null ? (
        <div className="px-5 pb-3">
          <LinkedRepositoriesWorkspaceBanner
            mainRepositoryUrl={mainRepositoryUrl}
            adoptedWorkspace={adoptedWorkspace}
          />
        </div>
      ) : null}

      <div
        className={
          children
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto"
        }
      >
        {children}
        {children ? null : (
          <LinkedRepositoryRows
            linkedUrls={linkedUrls}
            mainRepositoryUrl={mainRepositoryUrl}
            onMakeMain={onMakeMain}
            onUnlink={onUnlink}
            disabled={saving || mainPending}
            pendingMainUrl={pendingMainUrl}
            mainError={mainError}
            onRetryMain={onRetryMain}
          />
        )}
      </div>

      {mainError && (mainError.url === null || !linkedUrls.includes(mainError.url)) ? (
        <div className="px-5 pb-3">
          <span className="inline-flex items-center gap-1 text-xs text-destructive" role="alert">
            {mainError.message}
            {onRetryMain ? (
              <button
                type="button"
                className="font-medium text-primary underline"
                onClick={onRetryMain}
                disabled={saving || mainPending}
              >
                Retry
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      {saveError ? (
        <div className="border-t border-border p-3">
          <T3TeamErrorState
            error={saveError}
            action="updating linked repositories"
            onRetry={onSave}
          />
        </div>
      ) : null}

      <footer className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3.5">
        <span className="text-xs text-muted-foreground">
          {linkedUrls.length} linked
          {saved && !dirty
            ? " · saved, repositories sync when needed"
            : dirty
              ? " · unsaved changes"
              : ""}
        </span>
        <div className="flex items-center gap-2">
          {onClose ? (
            <Button variant="ghost" onClick={onClose} disabled={saving || mainPending}>
              {saved ? "Close" : "Cancel"}
            </Button>
          ) : null}
          {onSave ? (
            <Button onClick={onSave} disabled={saving || mainPending || !dirty}>
              {saving ? "Saving..." : saved && !dirty ? "Saved" : "Save"}
            </Button>
          ) : null}
        </div>
      </footer>
    </Card>
  );
}

export { LinkedRepositoryRows } from "~/t3team/components/t3team-LinkedRepositoryRows";
