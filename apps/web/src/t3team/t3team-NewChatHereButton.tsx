import { MessageSquarePlus } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { useStartChatHere } from "~/t3team/t3team-startChatHereContext";
import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

/** Starts a thread with this view as its context, opened beside it as a panel tab. */
export function NewChatHereButton({ target }: { readonly target: T3TeamViewTarget }) {
  const startChatHere = useStartChatHere();
  if (startChatHere === null) return null;
  return (
    <Button size="xs" variant="outline" className="shrink-0" onClick={() => startChatHere(target)}>
      <MessageSquarePlus />
      New chat here
    </Button>
  );
}
