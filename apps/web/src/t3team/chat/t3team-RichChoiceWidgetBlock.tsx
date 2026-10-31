import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import {
  formatRichChoicePick,
  parseRichChoicePayload,
} from "@t3tools/shared/t3team-richChoicePayload";
import { useState } from "react";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import { T3TeamRichChoice } from "~/t3team/rich-choice/t3team-RichChoice";
import { buildT3TeamWidgetPromptTransport } from "~/t3team/chat/t3team-useWidgetBlockController";
import { sendT3TeamThreadTurn } from "~/t3team/chat/t3team-sendThreadTurn";

function parseWidgetPayload(html: string) {
  try {
    return parseRichChoicePayload(JSON.parse(html));
  } catch {
    return null;
  }
}

/**
 * A `rich-choice` widget, rendered natively (no iframe) from its validated payload. The pick goes
 * back as the same hidden, agent-visible widget action message a bridge widget's `sendPrompt` makes.
 */
export function T3TeamRichChoiceWidgetBlock(props: {
  readonly widget: T3TeamMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { widget, threadRef } = props;
  const backend = useBackend();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const parsed = parseWidgetPayload(widget.html);

  if (!parsed?.ok) return null;
  const { payload } = parsed;
  const answered = picked.length > 0;
  return (
    <div className="w-full rounded-xl border border-border/55 bg-background/65 p-4">
      <p className="mb-3 text-sm font-medium text-foreground">{payload.prompt}</p>
      <T3TeamRichChoice
        prompt={payload.prompt}
        options={payload.options.map((option) => ({
          id: option.id,
          title: option.title,
          body: option.body,
          tag: option.tag,
          image: option.image ? { src: option.image } : undefined,
          chips: option.chips,
        }))}
        defaultId={payload.default_id}
        multiple={payload.multiple === true}
        selectedIds={picked}
        onChoose={(ids) => {
          if (answered || !backend || !threadRef) return;
          setPicked(ids);
          const transport = buildT3TeamWidgetPromptTransport({
            widgetId: widget.widgetId,
            widgetTitle: widget.title,
            text: formatRichChoicePick(payload, ids),
          });
          void sendT3TeamThreadTurn({
            backend,
            threadId: threadRef.threadId,
            text: transport.text,
            t3teamExt: transport.t3teamExt,
          });
        }}
      />
      {answered ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">Your pick was sent.</p>
      ) : null}
    </div>
  );
}
