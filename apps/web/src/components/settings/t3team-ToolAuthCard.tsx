"use client";

import { useEffect, useState } from "react";
import type { ToolAuthState } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { toolAuthFailureReasonFromState } from "../../state/t3team-toolAuthFailureFromError";
import {
  toolAuthFailureText,
  type ToolAuthFailureKind,
} from "../../state/t3team-toolAuthFailureMessage";
import type { ToolAuthActionOutcome } from "../../state/t3team-toolauthActionOutcome";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { AwaitingCodePhase, AwaitingOpenPhase, InstallingPhase } from "./t3team-ToolAuthCardPhases";
import { ToolAuthActionRow, ToolAuthFailureRow } from "./t3team-ToolAuthCardActions";
import { useToolAuthCardAction } from "./t3team-useToolAuthCardAction";
import type { ToolAuthToolMeta } from "./t3team-toolAuthTools";
import {
  PHASE_DOT_CLASS,
  connectedSummary,
  expiryLabel,
  toolAuthCardActionKind,
} from "./t3team-ToolAuthCardSummary";

export interface ToolAuthCardProps {
  readonly meta: ToolAuthToolMeta;
  /** `undefined` before the first snapshot arrives — rendered as `idle`. */
  readonly state: ToolAuthState | undefined;
  /** Replaces the tool's own description on the Connect prompt, e.g. on a cloud session. */
  readonly signInDescription?: string | undefined;
  /** How a failure sentence names the machine this runs on, e.g. `this cloud machine`. */
  readonly machineLabel?: string | undefined;
  /** A failure the caller already knows about, such as having no machine to run on at all. */
  readonly failure?: ToolAuthFailureKind | undefined;
  readonly onConnect: () => Promise<ToolAuthActionOutcome> | void;
  /**
   * Present only when the CLI is missing (the model picker's needs-install
   * case). When set, the idle and failed actions install *and* sign in as one
   * click, rather than offering a "Connect" that cannot possibly succeed
   * against a binary that isn't there. The settings page omits it, so its
   * cards keep the plain "Connect".
   */
  readonly onInstall?: (() => Promise<ToolAuthActionOutcome> | void) | undefined;
  readonly onSubmitCode: (code: string) => void;
  readonly onCancel: () => void;
}

/**
 * One tool's card in the "Connected tools" settings section. State is owned by the caller apart
 * from the in-flight action: a click's pending and error affordances are local, because the
 * machine may answer a request without ever touching the status stream.
 */
export function ToolAuthCard({
  meta,
  state,
  signInDescription,
  machineLabel = "this machine",
  failure,
  onConnect,
  onInstall,
  onSubmitCode,
  onCancel,
}: ToolAuthCardProps) {
  const phase = state?.phase ?? "idle";
  const [code, setCode] = useState("");
  // Install-and-sign-in when the binary is missing, plain sign-in otherwise. Safe as a universal
  // retry too: the server's install() re-checks presence first and goes straight to the login flow
  // when the CLI is already there. An expired credential is the exception — the CLI is plainly
  // installed, so there is nothing to install and this is a plain reconnect.
  const action = useToolAuthCardAction({
    action:
      toolAuthCardActionKind(phase, state?.reason) === "connect"
        ? onConnect
        : (onInstall ?? onConnect),
    phase,
  });
  const pendingLabel = onInstall ? "Starting install…" : "Starting sign-in…";
  const failureReason: ToolAuthFailureKind | null =
    action.failure ?? failure ?? toolAuthFailureReasonFromState(state);
  const failureText =
    failureReason === null
      ? null
      : toolAuthFailureText(failureReason, { label: meta.label, machine: machineLabel });

  useEffect(() => {
    if (phase !== "awaiting-code") setCode("");
  }, [phase]);

  const Icon = meta.icon;

  const titleNode = (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          PHASE_DOT_CLASS[failureReason !== null ? "failed" : phase],
        )}
        aria-hidden
      />
      <h3 className="truncate text-sm font-semibold text-foreground">{meta.label}</h3>
      {phase === "expired" ? (
        <Badge variant="warning" size="sm">
          Expired
        </Badge>
      ) : null}
    </div>
  );

  return (
    <div className="border-t border-border/60 px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3">
        {titleNode}

        {failureText !== null ? (
          <ToolAuthFailureRow
            text={failureText}
            retryLabel={phase === "expired" ? "Reconnect" : "Retry"}
            pending={action.pending}
            pendingLabel={pendingLabel}
            onRetry={action.run}
          />
        ) : null}

        {failureReason === null && phase === "idle" ? (
          <ToolAuthActionRow
            description={
              onInstall
                ? `${meta.label} isn't installed on ${machineLabel}. Installing it also signs you in.`
                : (signInDescription ?? meta.description)
            }
            actionLabel={onInstall ? "Install and connect" : "Connect"}
            pending={action.pending}
            pendingLabel={pendingLabel}
            onAction={action.run}
          />
        ) : null}

        {phase === "installing" ? (
          <InstallingPhase label={meta.label} installLog={state?.installLog} />
        ) : null}

        {phase === "starting" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Starting {meta.label}…
          </div>
        ) : null}

        {phase === "awaiting-open" ? (
          <AwaitingOpenPhase
            label={meta.label}
            url={state?.url}
            displayCode={state?.displayCode}
            onCancel={onCancel}
          />
        ) : null}

        {phase === "awaiting-code" ? (
          <AwaitingCodePhase
            label={meta.label}
            url={state?.url}
            code={code}
            onCodeChange={setCode}
            onSubmit={onSubmitCode}
          />
        ) : null}

        {phase === "verifying" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Verifying…
          </div>
        ) : null}

        {phase === "connected" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground/80">{connectedSummary(state)}</p>
              {expiryLabel(state?.expiresAt) ? (
                <p className="text-2xs text-muted-foreground">{expiryLabel(state?.expiresAt)}</p>
              ) : null}
              {state?.message ? <p className="text-2xs text-warning">{state.message}</p> : null}
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={onConnect}>
              Reconnect
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
