"use client";

import type { ProviderRefreshAfterSignInStatus } from "./t3team-useProviderRefreshAfterSignIn";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

export interface ModelPickerSignInRefreshNoticeProps {
  readonly displayName: string;
  readonly status: ProviderRefreshAfterSignInStatus;
  readonly error: string | null;
  readonly onRetry: () => void;
}

/**
 * What the connect panel says between "signed in" and the model list appearing: the machine is
 * re-checking the provider, or the check finished/failed and the user has a next step. Renders
 * nothing while idle. Never a dead end: both non-progress states carry a retry.
 */
export function ModelPickerSignInRefreshNotice({
  displayName,
  status,
  error,
  onRetry,
}: ModelPickerSignInRefreshNoticeProps) {
  if (status === "idle") return null;
  if (status === "refreshing") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground"
      >
        <Spinner className="size-3.5" />
        Signed in. Loading {displayName} models…
      </div>
    );
  }
  return (
    <div
      role={status === "failed" ? "alert" : "status"}
      className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-muted-foreground">
        {status === "failed"
          ? `Signed in, but ${displayName} could not be re-checked: ${error ?? "unknown error"}`
          : `Signed in, but ${displayName} has not reported its models yet.`}
      </p>
      <Button size="sm" variant="outline" className="shrink-0" onClick={onRetry}>
        Check again
      </Button>
    </div>
  );
}
