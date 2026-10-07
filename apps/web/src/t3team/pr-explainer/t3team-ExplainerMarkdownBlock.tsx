import type { T3TeamExplainerBlockOf } from "./model/t3team-explainer";
import { HostMarkdown } from "./t3team-explainerHostKit";
import { remarkExplainerInlineHtml } from "./t3team-explainerMarkdownHtml";
import { remarkExplainerSafeImages } from "./t3team-explainerMarkdownSafety";

const PLUGINS = [remarkExplainerSafeImages, remarkExplainerInlineHtml];

/**
 * GFM prose through the chat's own renderer. Raw HTML never reaches the host's HTML parser: a
 * small inline subset becomes formatting and the rest is dropped. Selectable for Ask.
 */
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
