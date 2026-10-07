import type { T3TeamExplainerCodeBlock } from "./model/t3team-explainer";
import { ExplainerHighlighted } from "./t3team-ExplainerHighlighted";

/** A snippet that is not a diff, with its named words marked. Selectable for Ask. */
export function ExplainerCodeBlock({ block }: { block: T3TeamExplainerCodeBlock }) {
  const caption = block.path ?? block.language;
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-card">
      {caption ? (
        <figcaption className="truncate border-b border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-2xs text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
      <pre
        data-xp-text="block"
        data-xp-block={block.id}
        className="overflow-x-auto px-2.5 py-1.5 font-mono text-2xs leading-5"
      >
        <code>
          <ExplainerHighlighted text={block.code} words={block.highlight} tone="neutral" />
        </code>
      </pre>
    </figure>
  );
}
