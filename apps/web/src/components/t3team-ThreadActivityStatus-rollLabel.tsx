import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

/**
 * Short-label roll: the outgoing label flips away, the incoming one flips
 * in (CSS choreography in index.css; out finishes before in starts).
 */
export function RollLabel({ text, shimmer }: { text: string; shimmer: boolean }) {
  const prevRef = useRef(text);
  const [previous, setPrevious] = useState<string | undefined>(undefined);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (prevRef.current === text) return;
    const prev = prevRef.current;
    prevRef.current = text;
    setPrevious(prev);
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 1100); // out + in
    return () => window.clearTimeout(t);
  }, [text]);
  return (
    <span className="t3team-roll-stage relative block">
      {rolling && previous ? (
        <span
          aria-hidden
          key={previous}
          className="t3team-status-roll-out absolute inset-x-0 top-0"
        >
          <span className={shimmer ? "t3team-label-shimmer" : ""}>{previous}</span>
        </span>
      ) : null}
      <span
        key={text}
        role="status"
        className={cn(
          shimmer ? "t3team-label-shimmer" : "",
          rolling ? "t3team-status-roll-in" : "",
        )}
      >
        {text}
      </span>
    </span>
  );
}
