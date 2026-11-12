/**
 * Per-row marker and action for the project's main repository. The main row shows a clear
 * "Main" badge; any other linked row has a "Make main" action so the user can switch with
 * one click. The control lives outside the row's link-toggle so it does not unlink the
 * repository. A click shows the new Main badge at once, then a pending "Saving…" on that
 * row; a failure shows a plain inline error with Retry and the previous main is restored.
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
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly repositoryLabel: string;
}) {
  const errorLine =
    error ? (
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
