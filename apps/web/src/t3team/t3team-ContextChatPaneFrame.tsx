/** The chrome of a context chat tab: upstream's side chat pane marker and a slim New chat row. */
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";

export function ContextChatPaneFrame(props: {
  readonly onNewChat: () => void;
  readonly newChatDisabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div data-side-chat-pane data-context-chat-pane className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-end border-b border-border px-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={props.onNewChat}
          disabled={props.newChatDisabled}
        >
          <PlusIcon />
          New chat
        </Button>
      </div>
      {props.children}
    </div>
  );
}
