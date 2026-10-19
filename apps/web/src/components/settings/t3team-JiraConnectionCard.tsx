"use client";

import { useState } from "react";

import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { JiraDisconnectDialog } from "./t3team-JiraDisconnectDialog";
import { describeJiraConnection } from "./t3team-jiraConnectionStatus";

/**
 * One connected Jira site in "Connected tools": who and where, whether the session works, when it
 * last synced, and the two things a user can do about it. A pure view over the account row; the
 * caller owns loading and the disconnect call.
 */
export function JiraConnectionCard({
  account,
  nowMs,
  onSignedIn,
  onDisconnect,
}: {
  readonly account: AtlassianAccountStatus;
  readonly nowMs: number;
  readonly onSignedIn: () => void;
  readonly onDisconnect: () => Promise<void>;
}) {
  const view = describeJiraConnection(account, nowMs);
  const [signingIn, setSigningIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectFailed, setDisconnectFailed] = useState(false);

  const disconnect = () => {
    setDisconnecting(true);
    setDisconnectFailed(false);
    onDisconnect()
      .catch(() => setDisconnectFailed(true))
      .finally(() => {
        setDisconnecting(false);
        setConfirming(false);
      });
  };

  return (
    <div className="border-t border-border/60 px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  view.needsSignIn ? "bg-destructive" : "bg-success",
                )}
                aria-hidden
              />
              <h3 className="truncate text-sm font-semibold text-foreground">{view.title}</h3>
              <span className="text-xs text-muted-foreground">{view.statusLabel}</span>
            </div>
            {view.subtitle ? (
              <p className="truncate text-xs text-muted-foreground/80">{view.subtitle}</p>
            ) : null}
            <p
              className={cn(
                "text-2xs",
                view.lastSync.stale ? "text-warning" : "text-muted-foreground",
              )}
            >
              {view.lastSync.text}
            </p>
            {view.catchUp ? <p className="text-2xs text-muted-foreground">{view.catchUp}</p> : null}
            {view.problem ? <p className="text-2xs text-destructive">{view.problem}</p> : null}
            {disconnectFailed ? (
              <p className="text-2xs text-destructive">Could not disconnect. Try again.</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant={view.needsSignIn ? "default" : "outline"}
              onClick={() => setSigningIn(true)}
            >
              Sign in again
            </Button>
            <Button size="sm" variant="destructive-outline" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          </div>
        </div>
        {signingIn ? (
          <JiraSignInPanel
            heading="Sign in to Jira again to refresh this connection."
            onSignedIn={() => {
              setSigningIn(false);
              onSignedIn();
            }}
          />
        ) : null}
      </div>
      <JiraDisconnectDialog
        site={view.title}
        open={confirming}
        disconnecting={disconnecting}
        onOpenChange={setConfirming}
        onConfirm={disconnect}
      />
    </div>
  );
}
