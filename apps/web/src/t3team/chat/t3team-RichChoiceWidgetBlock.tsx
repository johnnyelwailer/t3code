import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import {
  formatRichChoicePick,
  parseRichChoicePayload,
} from "@t3tools/shared/t3team-richChoicePayload";
import { useContext, useState } from "react";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { T3TeamRichChoice } from "~/t3team/rich-choice/t3team-RichChoice";
import { T3TeamTimelineRowsProvider } from "~/t3team/chat/t3team-timelineRows";
import { buildT3TeamWidgetPromptTransport } from "~/t3team/chat/t3team-useWidgetBlockController";
import { sendT3TeamThreadTurn } from "~/t3team/chat/t3team-sendThreadTurn";

function parseWidgetPayload(html: string) {
  try {
    return parseRichChoicePayload(JSON.parse(html));
  } catch {
    return null;
  }
}

type SendState =
  | { readonly status: "idle" }
  | { readonly status: "sending" | "sent"; readonly ids: readonly string[] }
  | { readonly status: "failed" };

/**
 * A `rich-choice` widget, rendered natively (no iframe) from its validated payload. The pick goes
 * back as the same hidden, agent-visible widget action message a bridge widget's `sendPrompt` makes.
 * Whether the card is open, answered or superseded comes from the thread, so it survives remounts.
 */
export function T3TeamRichChoiceWidgetBlock(props: {
  readonly widget: T3TeamMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { widget, threadRef } = props;
  const backend = useBackend();
  const threadState = useContext(T3TeamTimelineRowsProvider).richChoiceCardStates.get(
    widget.widgetId,
  );
  const [send, setSend] = useState<SendState>({ status: "idle" });
  const parsed = parseWidgetPayload(widget.html);
  if (!parsed?.ok) return null;
  const { payload } = parsed;

  const answeredIds = threadState?.status === "answered" ? threadState.pickedIds : null;
  const pickedIds =
    answeredIds ?? (send.status === "idle" || send.status === "failed" ? [] : send.ids);
  const stale = threadState?.status === "stale";
  const locked =
    answeredIds !== null || stale || send.status === "sending" || send.status === "sent";
  const canSend = backend !== null && threadRef !== null;

  const choose = (ids: readonly string[]) => {
    if (locked || !backend || !threadRef) return;
    setSend({ status: "sending", ids });
    const transport = buildT3TeamWidgetPromptTransport({
      widgetId: widget.widgetId,
      widgetTitle: widget.title,
      text: formatRichChoicePick(payload, ids),
    });
    sendT3TeamThreadTurn({
      backend,
      threadId: threadRef.threadId,
      text: transport.text,
      t3teamExt: transport.t3teamExt,
    }).then(
      () => setSend({ status: "sent", ids }),
      () => setSend({ status: "failed" }),
    );
  };

  const note =
    answeredIds || send.status === "sent"
      ? "Your pick was sent."
      : stale
        ? "This question was superseded."
        : send.status === "sending"
          ? "Sending your pick…"
          : send.status === "failed"
            ? "Your pick could not be sent. Try again."
            : null;

  return (
    <div className="w-full rounded-xl border border-border/55 bg-background/65 p-4">
      <p className="mb-3 text-sm font-medium text-foreground">{payload.prompt}</p>
      <T3TeamRichChoice
        prompt={payload.prompt}
        options={payload.options}
        defaultId={payload.default_id}
        multiple={payload.multiple === true}
        selectedIds={pickedIds}
        disabled={locked || !canSend}
        onChoose={choose}
      />
      {note ? (
        <p
          role={send.status === "failed" ? "alert" : "status"}
          className="mt-2 text-center text-xs text-muted-foreground"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
