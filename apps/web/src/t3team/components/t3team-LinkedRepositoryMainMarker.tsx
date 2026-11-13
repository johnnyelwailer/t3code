/**
 * Per-row "Main" badge or "Make main" action, outside the row's link-toggle so a click
 * does not unlink. The new Main badge shows at once, then "Saving…"; a failure shows
 * an inline error with Retry and restores the previous main.
 */

export function LinkedRepositoryMainMarker({
  isMain,
  onMakeMain,
  disabled,
  pending,
  error,
  onRetry,
  repositoryLabel,
}: {
  readonly isMain: boolean;
  readonly onMakeMain: () => void;
  readonly disabled?: boolean | undefined;
  readonly pending?: boolean | undefined;
  readonly error?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly repositoryLabel: string;
}) {
  const errorLine = error ? (
    <span className="inline-flex items-center gap-1 text-xs text-destructive" role="alert">
      {error}
      {onRetry ? (
        <button
          type="button"
          className="font-medium text-primary underline"
          onClick={onRetry}
          disabled={disabled || pending}
        >
          Retry
        </button>
      ) : null}
    </span>
  ) : null;

  if (isMain) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center rounded-md bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary"
          aria-label={`${repositoryLabel} is the main repository`}
        >
          Main
        </span>
        {pending ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Saving…
          </span>
        ) : null}
        {errorLine}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
        onClick={onMakeMain}
        disabled={disabled || pending}
        aria-label={`Make ${repositoryLabel} the main repository`}
      >
        Make main
      </button>
      {errorLine}
    </span>
  );
}
