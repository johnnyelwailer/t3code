/**
 * The card's warning lines (doc 07 §2.2): the icon carries the tone, the text stays neutral.
 * A config warning offers *Open config*; a sign-in warning signs in to the host it names, in the
 * app.
 */
import { PR_WATCH_WARNING_KIND } from "@t3tools/contracts";
import { ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { GitHubSignInAction } from "~/t3team/components/t3team-GitHubSignInAction";
import type { RunToggleWarning } from "~/t3team/t3team-recipeRunToggleState";

/** The host a sign-in warning names: its `key` by contract, else the hostname in its text. */
export function signInHostOf(warning: RunToggleWarning): string | null {
  if (warning.kind !== PR_WATCH_WARNING_KIND.signIn) return null;
  return warning.key ?? /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.exec(warning.text)?.[0] ?? null;
}

function WarningLine({
  warning,
  onOpenConfig,
}: {
  warning: RunToggleWarning;
  onOpenConfig?: (() => void) | undefined;
}) {
  const signInHost = signInHostOf(warning);
  const Icon = signInHost ? ShieldAlertIcon : TriangleAlertIcon;
  return (
    <li
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
      data-warning-kind={warning.kind}
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 text-xs leading-5 text-foreground">
        {warning.key && !signInHost ? <span className="font-mono">{warning.key} </span> : null}
        {warning.text}
        {warning.file ? (
          <span className="text-muted-foreground">
            {" "}
            · {warning.file}
            {warning.line !== undefined ? `:${warning.line}` : ""}
          </span>
        ) : null}
      </span>
      {warning.kind === PR_WATCH_WARNING_KIND.config && onOpenConfig ? (
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
        <div className="basis-full">
          <GitHubSignInAction host={signInHost} />
        </div>
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
