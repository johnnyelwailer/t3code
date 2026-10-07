import { useId, useState } from "react";

import type { T3TeamExplainerUiCompareBlock } from "./model/t3team-explainer";
import { ExplainerMediaMissing, useExplainerMediaUrl } from "./t3team-ExplainerMedia";
import { cn } from "./t3team-explainerHostKit";

function Label({ children, side }: { children: string; side: "left" | "right" }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1.5 rounded-sm bg-background/85 px-1.5 text-2xs font-medium text-foreground shadow-xs",
        side === "left" ? "left-1.5" : "right-1.5",
      )}
    >
      {children}
    </span>
  );
}

const IMAGE = "block max-h-80 w-full object-contain object-top";

/** Before/after screenshots: a drag slider over one frame, or a pair side by side. */
export function ExplainerUiCompare({ block }: { block: T3TeamExplainerUiCompareBlock }) {
  const [split, setSplit] = useState(50);
  const sliderId = useId();
  const before = useExplainerMediaUrl(block.before.src);
  const after = useExplainerMediaUrl(block.after.src);
  if (block.mode === "pair" || !before || !after) {
    const pair = [
      { image: block.before, url: before, label: "Before" },
      { image: block.after, url: after, label: "After" },
    ];
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {pair.map(({ image, url, label }) => (
          <figure key={label} className="relative overflow-hidden rounded-md border border-border">
            {url ? (
              <img src={url} alt={image.alt} className={IMAGE} />
            ) : (
              <ExplainerMediaMissing alt={image.alt} />
            )}
            <Label side="left">{image.caption ?? label}</Label>
          </figure>
        ))}
      </div>
    );
  }
  return (
    <figure className="relative select-none overflow-hidden rounded-md border border-border has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-1 has-focus-visible:ring-offset-background">
      <img src={after} alt={block.after.alt} className={IMAGE} />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      >
        <img src={before} alt={block.before.alt} className={IMAGE} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary ring-1 ring-background"
        style={{ left: `${split}%` }}
      />
      <Label side="left">{block.before.caption ?? "Before"}</Label>
      <Label side="right">{block.after.caption ?? "After"}</Label>
      <label htmlFor={sliderId} className="sr-only">
        Before and after split
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </figure>
  );
}
