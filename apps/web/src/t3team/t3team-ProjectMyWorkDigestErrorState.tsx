/**
 * The digest lens's failure state: one plain sentence about what went wrong, a
 * Retry, and the raw message tucked behind "Details" for people debugging.
 */
import { Button } from "~/components/ui/button";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { humanizeT3TeamBackendError } from "~/t3team/t3team-humanizeBackendError";

export function ProjectMyWorkDigestErrorState({
  error,
  onRetry,
  centered = false,
}: {
  error: string | undefined;
  onRetry: () => void;
  centered?: boolean;
}) {
  const humanized = humanizeT3TeamBackendError(error);
  return (
    <T3SurfacePanel
      tone="dashed"
      className={`px-6 py-8 text-sm text-muted-foreground ${centered ? "text-center" : ""}`}
    >
      <p className="font-medium text-foreground">Couldn't load your digest.</p>
      <p className="pt-1">{humanized.title}</p>
      <div className={`flex items-center gap-3 pt-3 ${centered ? "justify-center" : ""}`}>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
      {humanized.detail ? (
        <details className="pt-3 text-xs opacity-70">
          <summary className="cursor-pointer">Details</summary>
          <p className="break-all pt-1 text-left">{humanized.detail}</p>
        </details>
      ) : null}
    </T3SurfacePanel>
  );
}
