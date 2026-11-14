import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { useEnvironment } from "~/state/environments";

import { type PendingSend, useSendConfirmation } from "./t3team-sendConfirmationStore";

/** Under a sent message whose reply is outstanding: "Sending…", or "Not confirmed" with Retry. */
export function T3TeamSendConfirmationLine(props: { readonly messageId: string }) {
  const send = useSendConfirmation(props.messageId);
  return send === undefined ? null : <PendingSendLine send={send} />;
}

/** Only rows with a pending send read the connection, so other rows ignore its changes. */
function PendingSendLine({ send }: { readonly send: PendingSend }) {
  const environment = useEnvironment(send.environmentId);
  const online = environment?.connection.phase === "connected";
  if (send.status === "sending" && !send.retried) return <DelayedSendingNotice online={online} />;
  return (
    <T3TeamSendConfirmationNotice
      status={send.status}
      online={online}
      onRetry={() => send.retry?.()}
    />
  );
}

/** A healthy first send settles well inside this; the line is for a send stuck on a dropped link. */
const SENDING_LINE_DELAY_MS = 1500;

/** Mounted while a first send waits, so its timer starts fresh for each wait. */
function DelayedSendingNotice(props: { readonly online: boolean }) {
  const [shown, setShown] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a timer: shows the line only once a send has waited past the delay
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SENDING_LINE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return <T3TeamSendConfirmationNotice status="sending" online={props.online} onRetry={noop} />;
}

const noop = () => {};

export function T3TeamSendConfirmationNotice(props: {
  readonly status: PendingSend["status"];
  readonly online: boolean;
  readonly onRetry: () => void;
}) {
  if (props.status === "sending") {
    return (
      <p
        className="flex w-full justify-end text-xs text-muted-foreground"
        data-send-confirmation="sending"
      >
        {props.online ? "Sending…" : "Sending… it goes out when the connection is back."}
      </p>
    );
  }
  return (
    <p
      className="flex w-full flex-wrap items-center justify-end gap-2 text-xs text-destructive"
      data-send-confirmation="not-confirmed"
      role="alert"
    >
      {props.online
        ? "Not confirmed. Retry to check."
        : "Not confirmed: the connection did not come back."}
      <Button size="xs" variant="outline" onClick={props.onRetry}>
        Retry
      </Button>
    </p>
  );
}
