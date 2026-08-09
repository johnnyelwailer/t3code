"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

/**
 * The three wordy `ToolAuthCard` phase bodies, split out as sibling
 * presentational components per the repo's Maintainability section — each
 * one is a self-contained block of markup and (for `awaiting-open`) its own
 * copy-to-clipboard affordance, not shared state with the card itself.
 *
 * @module components/settings/ToolAuthCardPhases
 */

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

export interface InstallingPhaseProps {
  readonly label: string;
  readonly installLog: string | undefined;
}

/** Spinner + the installer's own tail line, so a minute-long install doesn't read as a hang. */
export function InstallingPhase({ label, installLog }: InstallingPhaseProps) {
  const progressLine = installProgressLine(installLog);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        Installing {label}…
      </div>
      {progressLine ? (
        <p className="truncate font-mono text-[11px] text-muted-foreground/70">{progressLine}</p>
      ) : null}
      <p className="text-[11px] text-muted-foreground/70">
        Signing in starts automatically once the install finishes.
      </p>
    </div>
  );
}

export interface AwaitingOpenPhaseProps {
  readonly label: string;
  readonly url: string | undefined;
  /** Present only for a device flow (Codex) — displayed, never gated on a hardcoded tool id. */
  readonly displayCode: string | undefined;
  readonly onCancel: () => void;
}

/** Sign-in button, plus (device flow only) the code box with its own copy control. */
export function AwaitingOpenPhase({ label, url, displayCode, onCancel }: AwaitingOpenPhaseProps) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: `${label} device code` });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground/80">
        Approve the sign-in in your browser to continue.
      </p>
      {url ? (
        <Button
          size="sm"
          variant="default"
          className="w-full sm:w-auto"
          render={<a href={url} target="_blank" rel="noopener noreferrer" />}
        >
          <ExternalLinkIcon className="size-3.5" />
          Open sign-in page
        </Button>
      ) : null}
      {/* Codex device flow: display the code — the human types it into
          the browser page. No input field: nothing comes back to us. */}
      {displayCode ? (
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2">
          <code className="flex-1 select-all font-mono text-lg tracking-wider text-foreground">
            {displayCode}
          </code>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Copy device code"
            onClick={() => copyToClipboard(displayCode, undefined)}
          >
            {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </Button>
        </div>
      ) : null}
      <Button size="xs" variant="ghost" className="w-fit text-muted-foreground" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export interface AwaitingCodePhaseProps {
  readonly label: string;
  readonly url: string | undefined;
  readonly code: string;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: (code: string) => void;
}

/** The single auto-focused input, Verify, and the secondary "open sign-in page again" link. */
export function AwaitingCodePhase({ label, url, code, onCodeChange, onSubmit }: AwaitingCodePhaseProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Secondary affordance, not a second field — a user who never
          opened the page, or closed the tab, must still be able to get
          back to it. */}
      {url ? (
        <a
          href={url}
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
          if (code.trim().length > 0) onSubmit(code);
        }}
      >
        <Input
          autoFocus
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          placeholder="Paste the code from your browser"
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} sign-in code`}
          className="sm:flex-1"
        />
        <Button type="submit" size="sm" disabled={code.trim().length === 0}>
          Verify
        </Button>
      </form>
    </div>
  );
}
