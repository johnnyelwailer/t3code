/**
 * Asks the user whether an agent's command may use some of their secrets. The command and purpose
 * are the agent's words, shown as such; no value is ever part of this card.
 */
import type {
  UserSecretApprovalDecision,
  UserSecretApprovalRequest,
  UserSecretRememberScope,
} from "@t3tools/contracts";
import { KeyRoundIcon } from "lucide-react";

import { Button } from "~/components/ui/button";

const REMEMBER_LABELS: Record<UserSecretRememberScope, string> = {
  thread: "Allow in this thread",
  machine: "Allow on this machine",
};

export function T3TeamUserSecretApprovalCard(props: {
  readonly request: UserSecretApprovalRequest;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onDecide: (decision: UserSecretApprovalDecision) => void;
}) {
  const { request } = props;
  const names = request.secretNames.join(", ");
  return (
    <section
      aria-label={`Allow use of ${names}`}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card p-4"
    >
      <div className="flex min-w-0 items-start gap-2">
        <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-icon-muted" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Let the agent use {names}
            {request.destination ? ` with ${request.destination}` : ""}?
          </p>
          <p className="text-sm text-muted-foreground">{request.purpose}</p>
        </div>
      </div>
      {request.command ? (
        <pre className="max-h-32 min-w-0 overflow-auto rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground whitespace-pre-wrap break-all">
          {request.command}
        </pre>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The command gets the value; the agent sees only masked output.
      </p>
      {props.error !== null ? (
        <p role="alert" className="text-xs text-destructive">
          {props.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost-muted"
          disabled={props.busy}
          onClick={() => props.onDecide("deny")}
        >
          Deny
        </Button>
        {request.rememberScope ? (
          <Button
            size="sm"
            variant="outline"
            disabled={props.busy}
            onClick={() => props.onDecide("allowAndRemember")}
          >
            {REMEMBER_LABELS[request.rememberScope]}
          </Button>
        ) : null}
        <Button size="sm" disabled={props.busy} onClick={() => props.onDecide("allowOnce")}>
          Allow once
        </Button>
      </div>
    </section>
  );
}
