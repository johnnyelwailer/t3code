/**
 * Presentational body of the linked-repositories dialog: help text, the no-main (or adopted
 * workspace) banner, and the linked rows with a per-row main marker. The live dialog wraps
 * this around the repository picker; stories and tests render it with a static list so every
 * state can be asserted and captured without GitHub discovery.
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";
import {
  LinkedRepositoriesHelp,
  LinkedRepositoriesWorkspaceBanner,
} from "~/t3team/components/t3team-LinkedRepositoriesHelp";
import { LinkedRepositoryMainMarker } from "~/t3team/components/t3team-LinkedRepositoryMainMarker";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Card } from "~/t3team/components/ui/t3team-card";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";

export type LinkedRepositoriesDialogViewProps = {
  readonly projectTitle: string;
  readonly linkedUrls: ReadonlyArray<string>;
  readonly mainRepositoryUrl: string | null;
  readonly adoptedWorkspace?: boolean;
  readonly onMakeMain: (url: string) => void;
  readonly onUnlink?: (url: string) => void;
  readonly onClose?: () => void;
  readonly onSave?: () => void;
  readonly saving?: boolean;
  readonly saved?: boolean;
  readonly dirty?: boolean;
  readonly saveError?: unknown;
  readonly pendingMainUrl?: string | null;
  readonly mainError?: { readonly url: string; readonly message: string } | null;
  readonly onRetryMain?: () => void;
  readonly children?: ReactNode;
  /** When false, hide main-repository help, banner and markers. */
  readonly showMainRepository?: boolean;
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
  pendingMainUrl = null,
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
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close dialog" disabled={saving}>
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
            disabled={saving}
            pendingMainUrl={pendingMainUrl}
            mainError={mainError}
            onRetryMain={onRetryMain}
          />
        )}
      </div>

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
          {saved && !dirty ? " · saved, repositories sync when needed" : dirty ? " · unsaved changes" : ""}
        </span>
        <div className="flex items-center gap-2">
          {onClose ? (
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {saved ? "Close" : "Cancel"}
            </Button>
          ) : null}
          {onSave ? (
            <Button onClick={onSave} disabled={saving || !dirty}>
              {saving ? "Saving..." : saved && !dirty ? "Saved" : "Save"}
            </Button>
          ) : null}
        </div>
      </footer>
    </Card>
  );
}

export function LinkedRepositoryRows({
  linkedUrls,
  mainRepositoryUrl,
  onMakeMain,
  onUnlink,
  disabled,
  pendingMainUrl,
  mainError,
  onRetryMain,
}: {
  readonly linkedUrls: ReadonlyArray<string>;
  readonly mainRepositoryUrl: string | null;
  readonly onMakeMain: (url: string) => void;
  readonly onUnlink?: (url: string) => void;
  readonly disabled?: boolean;
  readonly pendingMainUrl?: string | null;
  readonly mainError?: { readonly url: string; readonly message: string } | null;
  readonly onRetryMain?: () => void;
}) {
  if (linkedUrls.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
        No repositories are linked yet.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2">
      {linkedUrls.map((url) => {
        const label = parseRepositoryLabel(url);
        const slash = label.indexOf("/");
        const owner = slash < 0 ? "" : label.slice(0, slash + 1);
        const repo = slash < 0 ? label : label.slice(slash + 1);
        const isMain = url === mainRepositoryUrl;
        return (
          <li
            key={url}
            className="flex min-w-0 flex-col rounded-lg border border-primary/60 bg-primary/5 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm leading-snug break-words">
                <span className="text-muted-foreground">{owner}</span>
                <span className="font-medium">{repo}</span>
              </p>
              {onUnlink ? (
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onUnlink(url)}
                  disabled={disabled}
                  aria-label={`Unlink ${label}`}
                >
                  Unlink
                </button>
              ) : null}
            </div>
            <div className="mt-2">
              <LinkedRepositoryMainMarker
                isMain={isMain}
                onMakeMain={() => onMakeMain(url)}
                disabled={disabled}
                pending={pendingMainUrl === url}
                error={mainError?.url === url ? mainError.message : null}
                onRetry={mainError?.url === url ? onRetryMain : undefined}
                repositoryLabel={label}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
