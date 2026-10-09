/**
 * The timeline's questions of the app's view registry (`t3team-appViewRegistry.ts`): which
 * registered `message.view` renders a message (`findMessageView`), and whether an attachment is
 * drawn by a view rather than by the generic attachment list (`isMessageViewAttachment`).
 */
import type { T3TeamMessageAttachment } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { activateAppViewPacks, appViewRegistry } from "~/t3team/packs/t3team-appViewRegistry";
import type { PackWebActivation } from "~/t3team/packs/t3team-packWebHost";
import type { MessageViewEntry, MessageViewPlacement } from "~/t3team/packs/t3team-viewRegistry";
import type { ChatMessage } from "~/types";

import type { MessageViewRowContext } from "./t3team-hostMessageViews";

/** Activate more pack web modules — for stories and tests, which have no distribution. */
export function activateMessageViewPacks(activations: ReadonlyArray<PackWebActivation>): void {
  activateAppViewPacks(activations);
}

export interface ResolvedMessageView {
  readonly entry: MessageViewEntry<MessageViewRowContext>;
  readonly render: (context: MessageViewRowContext) => ReactNode;
}

/**
 * The first registered view, in registration order, with an attachment on `message` whose props
 * decode. Registration order is precedence: the host's shape card wins over its decision card.
 */
export function findMessageView(
  message: Pick<ChatMessage, "t3teamExt">,
  placement: MessageViewPlacement,
): ResolvedMessageView | null {
  const views = (message.t3teamExt?.attachments ?? []).filter(
    (attachment) => attachment.kind === "view",
  );
  if (views.length === 0) return null;
  for (const entry of appViewRegistry().list("message.view")) {
    if (entry.placement !== placement) continue;
    for (const attachment of views) {
      if (attachment.miniappId !== entry.id) continue;
      const render = entry.bind(attachment.props);
      if (render !== null) return { entry, render };
    }
  }
  return null;
}

/**
 * Whether a registered view draws `attachment`, so the generic attachment list must skip it. A
 * pack view whose props do not decode falls back to the generic row; a host view never does.
 */
export function isMessageViewAttachment(attachment: T3TeamMessageAttachment): boolean {
  if (attachment.kind !== "view") return false;
  const entry = appViewRegistry().get("message.view", attachment.miniappId);
  if (entry === undefined) return false;
  return entry.owner.kind === "host" || entry.bind(attachment.props) !== null;
}
