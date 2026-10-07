import type { T3TeamExplainerAnchor } from "./model/t3team-explainer";
import { Button, MessageCircleQuestionIcon, cn } from "./t3team-explainerHostKit";
import { describeExplainerAnchor } from "./t3team-explainerAnchor";
import { useExplainer } from "./t3team-explainerContext";

/**
 * Small "Ask" trigger shown on hover/focus of an askable part. Pressed again while its card is
 * open, it closes the card. `anchor` may be a function, read at press time (a video's moment).
 */
export function ExplainerAskButton({
  anchor,
  label = "Ask",
  variant = "ghost-muted",
  className,
}: {
  anchor: T3TeamExplainerAnchor | (() => T3TeamExplainerAnchor);
  label?: string;
  variant?: "ghost-muted" | "outline";
  /** Placement and reveal classes for the wrapper (e.g. show on the parent group's hover). */
  className?: string;
}) {
  const api = useExplainer();
  if (!api.canAsk) return null;
  const preview = typeof anchor === "function" ? anchor() : anchor;
  return (
    <span className={cn("inline-flex", className)}>
      <Button
        variant={variant}
        size="micro"
        aria-label={`Ask about ${describeExplainerAnchor(api.explainer, preview)}`}
        onClick={(event) => {
          event.stopPropagation();
          const at = event.currentTarget;
          api.openAsk(typeof anchor === "function" ? anchor() : anchor, at, at);
        }}
      >
        <MessageCircleQuestionIcon />
        {label}
      </Button>
    </span>
  );
}
