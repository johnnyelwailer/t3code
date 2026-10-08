/**
 * The app's `message.view` registry: the host's views, then every pack view the distribution
 * compiles in (`@t3code/distribution-web`), filled once, on the first lookup.
 *
 * The timeline asks it two questions: which registered view renders a message (`findMessageView`),
 * and whether an attachment is drawn by a view rather than by the generic attachment list
 * (`isMessageViewAttachment`).
 *
 * Module cycle, on purpose: host views render rows that themselves call
 * `getT3TeamRenderableAttachments`, which reads this registry. That is why the registry fills on
 * first use rather than at module load: nothing crosses the cycle while modules evaluate, so the
 * load order does not matter.
 */
import type { T3TeamMessageAttachment } from "@t3tools/contracts";
import { webActivations } from "@t3code/distribution-web";
import type { ReactNode } from "react";

import { activatePackWebModules, type PackWebActivation } from "~/t3team/packs/t3team-packWebHost";
import {
  createViewRegistry,
  type MessageViewEntry,
  type MessageViewPlacement,
} from "~/t3team/packs/t3team-viewRegistry";
import type { ChatMessage } from "~/types";

import { HOST_MESSAGE_VIEWS, type MessageViewRowContext } from "./t3team-hostMessageViews";

const registry = createViewRegistry<MessageViewRowContext>();
let filled = false;

function filledRegistry(): typeof registry {
  if (!filled) {
    filled = true;
    for (const entry of HOST_MESSAGE_VIEWS) registry.register(entry);
    activatePackWebModules(registry, webActivations);
  }
  return registry;
}

/** Activate more pack web modules — for stories and tests, which have no distribution. */
export function activateMessageViewPacks(activations: ReadonlyArray<PackWebActivation>): void {
  activatePackWebModules(filledRegistry(), activations);
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
  for (const entry of filledRegistry().list()) {
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
  const entry = filledRegistry().get(attachment.miniappId);
  if (entry === undefined) return false;
  return entry.owner.kind === "host" || entry.bind(attachment.props) !== null;
}
