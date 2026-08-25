import { BAR_COUNT } from "./types.ts";

/**
 * The six live bars of the recording pill. Heights are driven by the
 * shared animator (idle drift + voice amplitude); this component only
 * renders and registers the elements.
 */
export function VoiceBars({
  barCount = BAR_COUNT,
  registerBar,
}: {
  barCount?: number;
  registerBar: (index: number, el: HTMLSpanElement | null) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-[2.5px]" aria-hidden="true">
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            registerBar(i, el);
          }}
          className="w-[3px] rounded-full bg-current"
          style={{ height: "3.2px" }}
        />
      ))}
    </div>
  );
}
