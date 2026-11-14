import { Quote } from "lucide-react";
import { use, type MouseEvent, type RefObject } from "react";
import type { MessageId } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { TimelineRowCtx } from "./timelineRowContext";
import { selectedQuoteText } from "./MessageQuoteSelection";

export interface MessageReplyButtonProps {
  messageId: MessageId;
  author: string;
  text: string;
  /** The row's body element, so a text selection inside it quotes only that selection. */
  bodyRef?: RefObject<HTMLDivElement | null> | undefined;
}

export function MessageReplyButton({ messageId, author, text, bodyRef }: MessageReplyButtonProps) {
  const ctx = use(TimelineRowCtx);
  const onQuoteMessage = ctx.onQuoteMessage;
  if (onQuoteMessage === undefined || text.trim().length === 0) return null;
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onQuoteMessage({ messageId, author, text: selectedQuoteText(bodyRef?.current ?? null, text) });
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost-muted"
            aria-label="Quote this message"
            onClick={onClick}
          />
        }
      >
        <Quote className="size-3" />
      </TooltipTrigger>
      <TooltipPopup side="top">
        <p>Quote this message</p>
      </TooltipPopup>
    </Tooltip>
  );
}
