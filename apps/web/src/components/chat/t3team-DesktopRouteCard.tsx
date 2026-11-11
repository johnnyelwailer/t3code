import type { DesktopRouteCard } from "@t3tools/contracts";

import { Button } from "../ui/button";
import { T3TeamPendingQuestionMarkdown } from "./t3team-pendingQuestionMarkdown";
import { T3TeamDesktopRouteActions } from "./t3team-DesktopRouteActions";
import { DESKTOP_ROUTE_EXPIRED_MESSAGE } from "./t3team-desktopRouteRequestExpired";

/**
 * "Let this cloud session reach HOST through your computer?": session, host, the agent's reason as
 * Markdown (agent text always is), then Approve / wider scopes / Deny. A thread already on this computer has nothing to
 * route, so it says so and offers only Dismiss (answers Deny). `onAnswer` is the ordinary response.
 */
export function T3TeamDesktopRouteCard(props: {
  readonly card: DesktopRouteCard;
  /** The cloud session's name, or null when the thread runs on this computer. */
  readonly sessionLabel: string | null;
  readonly disabled?: boolean;
  /** The cloud (or agent) session has ended: no Approve or Deny, and a plain-words reason. */
  readonly expired?: boolean;
  readonly onAnswer: (label: string) => void;
}) {
  const { card, sessionLabel, disabled = false, expired = false, onAnswer } = props;
  const local = sessionLabel === null;
  const { decline } = card.actions;
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3" data-desktop-route-card>
      <p className="font-semibold text-sm">
        {local ? "Nothing to route" : "Route this host through your computer?"}
      </p>
      {local ? (
        <p className="text-sm" data-desktop-route-local>
          This thread already runs on your computer, so routing through it would change nothing. If
          the host can't be reached here, check the address, your VPN or DNS.
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {local ? null : (
          <>
            <dt className="text-muted-foreground">Cloud session</dt>
            <dd className="min-w-0 break-words" data-desktop-route-session>
              {sessionLabel}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Host</dt>
        <dd className="min-w-0">
          <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {card.target}
          </code>
          {card.internal && !local ? (
            <span
              className="ms-2 inline-block rounded bg-warning/16 px-1.5 py-0.5 font-medium text-warning-foreground text-xs"
              data-desktop-route-internal
            >
              Internal address
            </span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">{local ? "Agent said" : "Why"}</dt>
        <dd className="min-w-0 break-words" data-desktop-route-reason>
          {card.reason === "" ? (
            "The agent gave no reason."
          ) : (
            <T3TeamPendingQuestionMarkdown text={card.reason} className="text-sm" />
          )}
        </dd>
      </dl>
      {expired ? (
        <p className="text-sm" data-desktop-route-expired>
          {DESKTOP_ROUTE_EXPIRED_MESSAGE}
        </p>
      ) : local ? (
        decline === null ? null : (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onAnswer(decline)}
              data-desktop-route-action="decline"
            >
              Dismiss
            </Button>
          </div>
        )
      ) : (
        <>
          {card.internal ? (
            <p className="text-muted-foreground text-xs">
              It may resolve to a private network address on your network.
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Only this host, and only while your computer is online.
          </p>
          <T3TeamDesktopRouteActions card={card} disabled={disabled} onAnswer={onAnswer} />
        </>
      )}
    </div>
  );
}
