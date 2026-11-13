/**
 * Presentational quit-and-retry screen. Copy matches the desktop data-URL page
 * (`apps/desktop/src/backend/t3team-oldAppGuardCopy.ts`) that first-launch actually loads.
 */
import { useState, type ReactNode } from "react";

export type OldAppGuardState = "blocked" | "retrying" | "still-running" | "continuing";

export const OLD_APP_GUARD_MESSAGE = "Nexi Work is still running. Quit it, then click Retry.";
export const OLD_APP_GUARD_ERROR = "Nexi Work is still running.";
export const OLD_APP_GUARD_RETRY = "Retry";
export const OLD_APP_GUARD_RETRYING = "Retrying…";
export const OLD_APP_GUARD_CONTINUING = "Starting…";

const buttonLabel = (state: OldAppGuardState): string => {
  if (state === "retrying") return OLD_APP_GUARD_RETRYING;
  if (state === "continuing") return OLD_APP_GUARD_CONTINUING;
  return OLD_APP_GUARD_RETRY;
};

export function OldAppGuardScreen({
  state,
  onRetry,
}: {
  readonly state: OldAppGuardState;
  readonly onRetry?: () => void;
}): ReactNode {
  const [clicked, setClicked] = useState(false);
  if (state !== "blocked" && clicked) {
    setClicked(false);
  }
  const visual: OldAppGuardState = state === "blocked" && clicked ? "retrying" : state;
  const disabled = visual === "retrying" || visual === "continuing";
  return (
    <div
      className="flex h-full min-h-96 flex-col bg-background text-foreground"
      data-state={visual}
    >
      <div
        aria-hidden="true"
        className="h-[max(40px,env(titlebar-area-height,52px))] shrink-0"
        data-chrome="titlebar"
      />
      <main className="flex flex-1 items-center justify-center px-8 pb-12">
        <div className="max-w-md text-center">
          <p className="mb-4 text-sm leading-normal">{OLD_APP_GUARD_MESSAGE}</p>
          {visual === "still-running" ? (
            <p className="mb-4 text-xs leading-snug text-destructive" role="alert">
              {OLD_APP_GUARD_ERROR}
            </p>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setClicked(true);
              onRetry?.();
            }}
            className="rounded-lg bg-foreground px-4.5 py-2 text-sm font-medium text-background disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground"
          >
            {buttonLabel(visual)}
          </button>
          <div className="sr-only" aria-live="polite">
            {visual === "retrying"
              ? OLD_APP_GUARD_RETRYING
              : visual === "continuing"
                ? OLD_APP_GUARD_CONTINUING
                : visual === "still-running"
                  ? OLD_APP_GUARD_ERROR
                  : ""}
          </div>
        </div>
      </main>
    </div>
  );
}
