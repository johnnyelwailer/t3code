"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ToolAuthState } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import type { ToolAuthToolMeta } from "./t3team-toolAuthTools";

/** Dot color per phase — same token classes `providerStatus.ts` uses. */
const PHASE_DOT_CLASS: Record<ToolAuthState["phase"], string> = {
  idle: "bg-muted-foreground/40",
  installing: "bg-warning",
  starting: "bg-warning",
  "awaiting-open": "bg-warning",
  "awaiting-code": "bg-warning",
  verifying: "bg-warning",
  connected: "bg-success",
  failed: "bg-destructive",
  expired: "bg-destructive",
};

function expiryLabel(expiresAt: number | undefined): string | null {
  if (expiresAt === undefined) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

/**
 * `account` and `organization` are independent, both optional, and — per the
 * one real CLI shape verified so far (`claude auth status --json`, which
 * reports only `authMethod`/`apiProvider`) — usually BOTH absent. Degrades to
 * a plain "Connected" rather than a dangling separator or an empty "Signed in
 * as ". Never presents `authMethod`/`apiProvider` as an account — those
 * describe how the tool is authenticated, not who is signed in, and this
 * summary only ever reads the two dedicated fields.
 */
function connectedSummary(state: ToolAuthState | undefined): string {
  const account = state?.account?.trim();
  const organization = state?.organization?.trim();
  if (account && organization) return `Signed in as ${account} · ${organization}`;
  if (account) return `Signed in as ${account}`;
  if (organization) return `Signed in · ${organization}`;
  return "Connected";
}

/**
 * The installer's most recent meaningful line, for a progress hint while
 * `installing`. npm is chatty and the log is a rolling buffer, so showing the
 * tail is both the cheapest and the most informative option — the alternative
 * (a bare spinner for a minute-long install) reads as a hang.
 */
function installProgressLine(installLog: string | undefined): string | null {
  if (!installLog) return null;
  const lines = installLog
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.at(-1) ?? null;
}

export interface ToolAuthCardProps {
  readonly meta: ToolAuthToolMeta;
  /** `undefined` before the first snapshot arrives — rendered as `idle`. */
  readonly state: ToolAuthState | undefined;
  readonly onConnect: () => void;
  /**
   * Present only when the CLI is missing (the model picker's needs-install
   * case). When set, the idle and failed actions install *and* sign in as one
   * click, rather than offering a "Connect" that cannot possibly succeed
   * against a binary that isn't there. The settings page omits it, so its
   * cards keep the plain "Connect".
   */
  readonly onInstall?: (() => void) | undefined;
  readonly onSubmitCode: (code: string) => void;
  readonly onCancel: () => void;
}

/**
 * One tool's card in the "Connected tools" settings section. A pure,
 * props-driven presentational component (state is owned by the caller) —
 * mirrors `ProviderInstanceCard`'s split between wiring (in the settings
 * panel) and rendering (here).
 */
export function ToolAuthCard({
  meta,
  state,
  onConnect,
  onInstall,
  onSubmitCode,
  onCancel,
}: ToolAuthCardProps) {
  const phase = state?.phase ?? "idle";
  const [code, setCode] = useState("");
  // Install-and-sign-in when the binary is missing, plain sign-in otherwise.
  // Safe as a universal retry too: the server's install() re-checks presence
  // first and goes straight to the login flow when the CLI is already there.
  const primaryAction = onInstall ?? onConnect;

  useEffect(() => {
    if (phase !== "awaiting-code") setCode("");
  }, [phase]);

  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: `${meta.label} device code` });

  const Icon = meta.icon;

  const titleNode = (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className={cn("size-2 shrink-0 rounded-full", PHASE_DOT_CLASS[phase])} aria-hidden />
      <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
        {meta.label}
      </h3>
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

        {phase === "idle" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground/80">
              {onInstall
                ? `${meta.label} isn't installed in this sandbox yet. Installing it also signs you in.`
                : meta.description}
            </p>
            <Button size="sm" variant="outline" className="shrink-0" onClick={primaryAction}>
              {onInstall ? "Install and connect" : "Connect"}
            </Button>
          </div>
        ) : null}

        {phase === "installing" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Installing {meta.label}…
            </div>
            {installProgressLine(state?.installLog) ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground/70">
                {installProgressLine(state?.installLog)}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground/70">
              Signing in starts automatically once the install finishes.
            </p>
          </div>
        ) : null}

        {phase === "starting" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Starting {meta.label}…
          </div>
        ) : null}

        {phase === "awaiting-open" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground/80">
              Approve the sign-in in your browser to continue.
            </p>
            {state?.url ? (
              <Button
                size="sm"
                variant="default"
                className="w-full sm:w-auto"
                render={<a href={state.url} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLinkIcon className="size-3.5" />
                Open sign-in page
              </Button>
            ) : null}
            {/* Codex device flow: display the code — the human types it into
                the browser page. No input field: nothing comes back to us. */}
            {state?.displayCode ? (
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2">
                <code className="flex-1 select-all font-mono text-lg tracking-wider text-foreground">
                  {state.displayCode}
                </code>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Copy device code"
                  onClick={() => copyToClipboard(state.displayCode!, undefined)}
                >
                  {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                </Button>
              </div>
            ) : null}
            <Button size="xs" variant="ghost" className="w-fit text-muted-foreground" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : null}

        {phase === "awaiting-code" ? (
          <div className="flex flex-col gap-2">
            {/* Secondary affordance, not a second field — a user who never
                opened the page, or closed the tab, must still be able to get
                back to it. */}
            {state?.url ? (
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLinkIcon className="size-3" />
                Open sign-in page again
              </a>
            ) : null}
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                if (code.trim().length > 0) onSubmitCode(code);
              }}
            >
              <Input
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Paste the code from your browser"
                spellCheck={false}
                autoComplete="off"
                aria-label={`${meta.label} sign-in code`}
                className="sm:flex-1"
              />
              <Button type="submit" size="sm" disabled={code.trim().length === 0}>
                Verify
              </Button>
            </form>
          </div>
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
                <p className="text-[11px] text-muted-foreground">{expiryLabel(state?.expiresAt)}</p>
              ) : null}
              {state?.message ? (
                <p className="text-[11px] text-warning">{state.message}</p>
              ) : null}
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={onConnect}>
              Reconnect
            </Button>
          </div>
        ) : null}

        {phase === "expired" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-destructive">
              {state?.message ?? "Your credential has expired."}
            </p>
            <Button size="sm" variant="outline" className="shrink-0" onClick={onConnect}>
              Reconnect
            </Button>
          </div>
        ) : null}

        {phase === "failed" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* The CLI's or the package manager's own words, never a generic
                error — a 403 from the registry and a rejected sign-in code need
                completely different actions from the user. */}
            <p className="whitespace-pre-line text-xs text-destructive">
              {state?.message ?? "Sign-in failed."}
            </p>
            <Button size="sm" variant="outline" className="shrink-0" onClick={primaryAction}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
