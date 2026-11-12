"use client";

import type { ProviderRefreshAfterSignInStatus } from "./t3team-useProviderRefreshAfterSignIn";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

export interface ModelPickerSignInRefreshNoticeProps {
  readonly displayName: string;
  readonly status: ProviderRefreshAfterSignInStatus;
  readonly error: string | null;
  readonly onRetry: () => void;
  /** For a lapsed account: starts the sign-in, instead of looping Check again. */
  readonly onSignIn?: () => void;
}

/**
 * What the connect panel says between "signed in" and the model list appearing: the machine is
 * re-checking the provider, or the check finished/failed and the user has a next step. Renders
 * nothing while idle. Never a dead end: a lapsed account offers Sign in; the other finished states carry Check again.
 */
/** The one-line copy for a finished re-check. Extracted so the lapsed-account wording is tested. */
export function modelPickerSignInRefreshMessage(input: {
  readonly status: Exclude<ProviderRefreshAfterSignInStatus, "idle" | "refreshing">;
  readonly displayName: string;
  readonly error: string | null;
}): string {
  if (input.status === "unauthenticated") {
    return "Not authenticated. Sign in to use this account.";
  }
  if (input.status === "failed") {
    return `Signed in, but ${input.displayName} could not be re-checked: ${input.error ?? "unknown error"}`;
  }
  return `Signed in, but ${input.displayName} has not reported its models yet.`;
}

export function ModelPickerSignInRefreshNotice({
  displayName,
  status,
  error,
  onRetry,
  onSignIn,
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
  const unauthenticated = status === "unauthenticated";
  return (
    <div
      role={status === "failed" ? "alert" : "status"}
      className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs text-muted-foreground">
        {modelPickerSignInRefreshMessage({ status, displayName, error })}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={unauthenticated && onSignIn ? onSignIn : onRetry}
      >
        {unauthenticated ? "Sign in" : "Check again"}
      </Button>
    </div>
  );
}
