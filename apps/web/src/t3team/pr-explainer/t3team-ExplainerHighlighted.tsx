import { cn } from "./t3team-explainerHostKit";
import { explainerHighlightSegments } from "./t3team-explainerDiffLines";

const TONE = {
  add: "rounded-[3px] bg-diff-addition/25 text-diff-addition-foreground",
  delete: "rounded-[3px] bg-diff-deletion/25 text-diff-deletion-foreground line-through",
  neutral: "rounded-[3px] bg-primary/12 text-foreground",
} as const;

/** `text` with every occurrence of `words` marked, in the tone of its line. */
export function ExplainerHighlighted({
  text,
  words,
  tone,
}: {
  text: string;
  words: ReadonlyArray<string> | undefined;
  tone: keyof typeof TONE;
}) {
  if (!words || words.length === 0) return text;
  let offset = 0;
  return explainerHighlightSegments(text, words).map((segment) => {
    const key = offset;
    offset += segment.text.length;
    return segment.mark ? (
      <mark key={key} className={cn(TONE[tone])}>
        {segment.text}
      </mark>
    ) : (
      <span key={key}>{segment.text}</span>
    );
  });
}
