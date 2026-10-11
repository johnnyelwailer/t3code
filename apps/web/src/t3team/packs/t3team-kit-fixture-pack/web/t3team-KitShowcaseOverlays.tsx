/** The kit's overlays: a tooltip and a popover, each on the pack's own trigger element. */
import {
  Button,
  Icon,
  Popover,
  PopoverPopup,
  PopoverTrigger,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@t3team/pack-ui";

export function KitShowcaseOverlays() {
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger render={<Button variant="outline" size="xs" />}>
          <Icon name="info" />
          Step 2
        </TooltipTrigger>
        <TooltipPopup side="bottom">2. Build steps — partial</TooltipPopup>
      </Tooltip>
      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="xs" />}>
          <Icon name="message-circle-question" />
          Ask
        </PopoverTrigger>
        <PopoverPopup side="bottom" align="start" padding="compact" aria-label="Ask about this">
          <span className="text-xs">A popover on the host&apos;s surface.</span>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
