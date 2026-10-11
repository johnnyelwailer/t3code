import type { ComponentProps } from "react";

import ChatView from "~/components/ChatView";
import { useT3TeamEnvironmentThreadExtension } from "~/t3team/chat/t3team-useEnvironmentThreadExtension";

/**
 * The ChatView of upstream's thread routes (`/draft/$draftId`, `/$environmentId/$threadId`), with
 * the Team workflow-card hooks of the thread's own environment on the server route (see the hook
 * for why). Both route kinds render this one component so a draft's promotion onto the thread
 * route keeps the same ChatView mounted, exactly as it did when `ThreadRouteView` rendered
 * ChatView directly.
 */
export function T3TeamRouteChatView(props: ComponentProps<typeof ChatView>) {
  const extension = useT3TeamEnvironmentThreadExtension(props.environmentId, props.threadId);
  return props.routeKind === "server" ? (
    <ChatView {...props} {...extension} />
  ) : (
    <ChatView {...props} />
  );
}
