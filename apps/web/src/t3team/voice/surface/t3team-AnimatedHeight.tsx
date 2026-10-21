import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { observeResize } from "~/lib/observeResize";
import { VOICE_CLASS } from "./t3team-voiceClasses";

/**
 * Follows its content's height with an eased transition, so a card that grows or shrinks moves
 * the widget smoothly instead of popping. The first measure sets the height without animating.
 */
export function AnimatedHeight(props: { readonly children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const element = inner.current;
    if (element === null) return;
    return observeResize(element, ([entry]) => {
      if (entry !== undefined) setHeight(entry.contentRect.height);
    });
  }, []);

  return (
    <div className={VOICE_CLASS.size} style={height === undefined ? undefined : { height }}>
      <div ref={inner} className="relative">
        {props.children}
      </div>
    </div>
  );
}
