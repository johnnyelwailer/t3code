/**
 * A determinate bar for a session that is still provisioning. Deliberately not
 * a spinner: the timings are predictable enough (~2.5 min) that an indeterminate
 * spinner would understate how much is known.
 */
export function CloudSessionProgressBar({ progress }: { readonly progress: number }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full rounded-full bg-warning transition-[width] duration-500 ease-out"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}
