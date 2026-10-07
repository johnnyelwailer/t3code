import type { T3TeamPrExplainerVisual } from "@t3tools/contracts";
import { useId, useState } from "react";

type UiCompare = Extract<T3TeamPrExplainerVisual, { kind: "uiCompare" }>;

function Label({ children, side }: { children: string; side: "left" | "right" }) {
  return (
    <span
      className={`pointer-events-none absolute top-1.5 ${side === "left" ? "left-1.5" : "right-1.5"} rounded-sm bg-background/85 px-1.5 text-2xs font-medium text-foreground shadow-xs`}
    >
      {children}
    </span>
  );
}

/** Before/after screenshots: a drag slider over one frame, or a pair side by side. */
export function PrExplainerUiCompare({ visual }: { visual: UiCompare }) {
  const [split, setSplit] = useState(50);
  const sliderId = useId();
  if (visual.mode === "pair") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {[visual.before, visual.after].map((image, index) => (
          <figure
            key={image.src}
            className="relative overflow-hidden rounded-md border border-border"
          >
            <img
              src={image.src}
              alt={image.alt}
              className="block max-h-80 w-full object-contain object-top"
            />
            <Label side="left">{image.caption ?? (index === 0 ? "Before" : "After")}</Label>
          </figure>
        ))}
      </div>
    );
  }
  return (
    <figure className="relative select-none overflow-hidden rounded-md border border-border">
      <img
        src={visual.after.src}
        alt={visual.after.alt}
        className="block max-h-80 w-full object-contain object-top"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      >
        <img
          src={visual.before.src}
          alt={visual.before.alt}
          className="block max-h-80 w-full object-contain object-top"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary ring-1 ring-background"
        style={{ left: `${split}%` }}
      />
      <Label side="left">{visual.before.caption ?? "Before"}</Label>
      <Label side="right">{visual.after.caption ?? "After"}</Label>
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
