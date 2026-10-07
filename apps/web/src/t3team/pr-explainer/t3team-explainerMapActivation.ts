import type { KeyboardEvent, MouseEvent, SVGProps } from "react";

export type ExplainerMapActivate = (target: Element) => void;

/** An SVG map part that behaves as a button: click, Enter or Space asks about it. */
export function explainerMapActivation(onActivate: ExplainerMapActivate) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: (event: MouseEvent<SVGGElement>) => onActivate(event.currentTarget),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate(event.currentTarget);
    },
  } satisfies SVGProps<SVGGElement>;
}
