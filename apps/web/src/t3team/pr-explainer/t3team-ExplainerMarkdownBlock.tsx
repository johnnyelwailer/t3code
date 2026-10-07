import type { T3TeamExplainerBlockOf } from "./model/t3team-explainer";
import { HostMarkdown } from "./t3team-explainerHostKit";
import { remarkExplainerSafeImages } from "./t3team-explainerMarkdownSafety";

const PLUGINS = [remarkExplainerSafeImages];

/** GFM prose through the chat's own renderer, with raw HTML shown as text. Selectable for Ask. */
export function ExplainerMarkdownBlock({ block }: { block: T3TeamExplainerBlockOf<"markdown"> }) {
  return (
    <div data-xp-text="block" data-xp-block={block.id} className="min-w-0">
      <HostMarkdown
        text={block.text}
        cwd={undefined}
        parseRawHtml={false}
        extraRemarkPlugins={PLUGINS}
        className="text-xs"
      />
    </div>
  );
}
