/**
 * Linked-repository rows for the manage-repositories dialog: each row shows
 * the owner/repo label, an Unlink action, and the Main / Make main marker.
 */
import { memo } from "react";

import { parseRepositoryLabel } from "~/t3team/components/t3team-linkedRepositories";
import { LinkedRepositoryMainMarker } from "~/t3team/components/t3team-LinkedRepositoryMainMarker";

export type LinkedRepositoryRowProps = {
  readonly url: string;
  readonly isMain: boolean;
  readonly onMakeMain: (url: string) => void;
  readonly onUnlink?: ((url: string) => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly pending?: boolean | undefined;
  readonly error?: string | null | undefined;
  readonly onRetryMain?: (() => void) | undefined;
};

/** One linked-repository row. Memoized on its own primitives so a main-switch does not redraw the others. */
export const LinkedRepositoryRow = memo(function LinkedRepositoryRow({
  url,
  isMain,
  onMakeMain,
  onUnlink,
  disabled,
  pending,
  error,
  onRetryMain,
}: LinkedRepositoryRowProps) {
  const label = parseRepositoryLabel(url);
  const slash = label.indexOf("/");
  const owner = slash < 0 ? "" : label.slice(0, slash + 1);
  const repo = slash < 0 ? label : label.slice(slash + 1);
  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-primary/60 bg-primary/5 p-3">
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
          pending={pending}
          error={error}
          onRetry={error ? onRetryMain : undefined}
          repositoryLabel={label}
        />
      </div>
    </li>
  );
});

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
  readonly onUnlink?: ((url: string) => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly pendingMainUrl?: string | null | undefined;
  readonly mainError?: { readonly url: string | null; readonly message: string } | null | undefined;
  readonly onRetryMain?: (() => void) | undefined;
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
      {linkedUrls.map((url) => (
        <LinkedRepositoryRow
          key={url}
          url={url}
          isMain={url === mainRepositoryUrl}
          onMakeMain={onMakeMain}
          onUnlink={onUnlink}
          disabled={disabled}
          pending={pendingMainUrl === url}
          error={mainError?.url === url ? mainError.message : null}
          onRetryMain={onRetryMain}
        />
      ))}
    </ul>
  );
}
