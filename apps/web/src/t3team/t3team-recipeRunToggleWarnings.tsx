/**
 * The card's warning lines (doc 07 §2.2): the icon carries the tone, the text stays neutral.
 * A config warning offers *Open config*; a sign-in warning shows the copyable `gh auth login`
 * command the server's inbox loader already names.
 */
import { ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";

import { PullRequestCopyableCode } from "~/components/pullRequest/PullRequestCopyableCode";
import { Button } from "~/components/ui/button";
import type { RunToggleWarning } from "~/t3team/t3team-recipeRunToggleState";

export function signInCommand(host: string): string {
  return `gh auth login --hostname ${host}`;
}

/** The host a sign-in warning names ("Not signed in to nexplore.ghe.com"); the summary carries no field for it yet. */
export function signInHostOf(warning: RunToggleWarning): string | null {
  if (warning.kind !== "sign-in") return null;
  return /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.exec(warning.text)?.[0] ?? null;
}

function WarningLine({
  warning,
  onOpenConfig,
}: {
  warning: RunToggleWarning;
  onOpenConfig?: (() => void) | undefined;
}) {
  const Icon = warning.kind === "sign-in" ? ShieldAlertIcon : TriangleAlertIcon;
  const signInHost = signInHostOf(warning);
  return (
    <li
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
      data-warning-kind={warning.kind}
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 text-xs leading-5 text-foreground">
        {warning.key ? <span className="font-mono">{warning.key} </span> : null}
        {warning.text}
        {warning.file ? (
          <span className="text-muted-foreground">
            {" "}
            · {warning.file}
            {warning.line !== undefined ? `:${warning.line}` : ""}
          </span>
        ) : null}
      </span>
      {warning.kind === "config" && onOpenConfig ? (
        <Button
          variant="outline"
          size="micro"
          onClick={(event) => {
            event.stopPropagation();
            onOpenConfig();
          }}
        >
          Open config
        </Button>
      ) : null}
      {signInHost ? (
        <PullRequestCopyableCode
          value={signInCommand(signInHost)}
          target="sign-in command"
          copyLabel="Copy sign-in command"
          copiedLabel="Sign-in command copied"
          className="basis-full font-mono text-2xs text-muted-foreground"
        />
      ) : null}
    </li>
  );
}

export function RecipeRunToggleWarnings({
  warnings,
  onOpenConfig,
}: {
  warnings: ReadonlyArray<RunToggleWarning>;
  onOpenConfig?: (() => void) | undefined;
}) {
  if (warnings.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="run-toggle-warnings">
      {warnings.map((warning, index) => (
        <WarningLine
          key={`${warning.kind}-${index}`}
          warning={warning}
          onOpenConfig={onOpenConfig}
        />
      ))}
    </ul>
  );
}
