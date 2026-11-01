import type { DesktopRouteCard } from "@t3tools/contracts";

import { Button } from "../ui/button";

/**
 * The question "let this cloud session reach HOST through your computer?", shown as what it is:
 * which cloud session, which host (in monospace, with a warning for an internal address), the
 * agent's reason as plain text, and three actions. Presentational; the panel wires `onAnswer` to
 * the ordinary user-input response, so nothing new crosses the wire.
 */
export function T3TeamDesktopRouteCard(props: {
  readonly card: DesktopRouteCard;
  readonly sessionLabel: string;
  readonly disabled?: boolean;
  readonly onAnswer: (label: string) => void;
}) {
  const { card, sessionLabel, disabled = false, onAnswer } = props;
  const { once, session, always, decline } = card.actions;
  const action = (label: string | null, text: string, variant: "default" | "outline" | "ghost") =>
    label === null ? null : (
      <Button
        size="sm"
        variant={variant}
        disabled={disabled}
        onClick={() => onAnswer(label)}
        data-desktop-route-action={text}
      >
        {text}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3" data-desktop-route-card>
      <p className="font-semibold text-sm">Route through your computer?</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Cloud session</dt>
        <dd className="min-w-0 break-words" data-desktop-route-session>
          {sessionLabel}
        </dd>
        <dt className="text-muted-foreground">Host</dt>
        <dd className="min-w-0">
          <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {card.target}
          </code>
          {card.internal ? (
            <span
              className="ms-2 inline-block rounded bg-warning/16 px-1.5 py-0.5 font-medium text-warning-foreground text-xs"
              data-desktop-route-internal
            >
              Internal address
            </span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">Why</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words">
          {card.reason === "" ? "The agent gave no reason." : card.reason}
        </dd>
      </dl>
      {card.internal ? (
        <p className="text-muted-foreground text-xs">
          It may resolve to a private network address on your network.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Only this host, only while your computer is online.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {action(once, "Approve once", "default")}
        {action(session, "Approve for this session", "outline")}
        {action(decline, "Deny", "ghost")}
        {always === null ? null : (
          <Button
            size="sm"
            variant="ghost-muted"
            disabled={disabled}
            onClick={() => onAnswer(always)}
            className="ms-auto"
            data-desktop-route-action="Always for this host"
          >
            Always for this host
          </Button>
        )}
      </div>
    </div>
  );
}
