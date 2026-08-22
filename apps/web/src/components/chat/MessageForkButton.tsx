import { memo } from "react";
import { GitFork } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Subtle per-message affordance to fork the thread from this message (branch
 * point: the fork carries messages up to and including it). Rendered next to
 * the copy button; only shown when the host wires `onForkThread`.
 */
export const MessageForkButton = memo(function MessageForkButton({
  messageId,
  onForkThread,
  size = "xs",
  variant = "ghost",
  className,
}: {
  messageId: string;
  onForkThread: (input: { readonly messageId: string }) => void | Promise<void>;
  size?: "xs" | "icon-xs";
  variant?: "outline" | "ghost";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Fork thread from here"
            type="button"
            size={size}
            variant={variant}
            onClick={() => void onForkThread({ messageId })}
            className={cn("text-muted-foreground hover:text-foreground", className)}
          />
        }
      >
        <GitFork className="size-3" />
      </TooltipTrigger>
      <TooltipPopup>
        <p>Fork thread from here</p>
      </TooltipPopup>
    </Tooltip>
  );
});
