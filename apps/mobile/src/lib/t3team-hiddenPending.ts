import { isHiddenT3TeamFramingMessage } from "@t3tools/client-runtime/state/message-framing";
import type { OrchestrationMessageContext } from "@t3tools/contracts";

type WithContext = { readonly context?: OrchestrationMessageContext | undefined };

/**
 * A queued or acknowledged-but-unprojected message is a feed row that still carries its context, so
 * hidden framing (a rich-choice pick) must be filtered here too, or its raw text shows. Same array
 * when nothing is hidden.
 */
export function withoutHiddenPendingRows<E extends { readonly type: string }>(
  rows: ReadonlyArray<E>,
): ReadonlyArray<E> {
  const visible = rows.filter((row) => {
    if (row.type !== "message") return true;
    const { message } = row as { readonly message?: WithContext };
    return message === undefined || !isHiddenT3TeamFramingMessage(message);
  });
  return visible.length === rows.length ? rows : visible;
}
