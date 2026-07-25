import { useEffect, useRef } from "react";

type RectLike = Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right">;

export function isRectOutsideVisibleBounds(rect: RectLike, bounds: RectLike): boolean {
  return (
    rect.top < bounds.top ||
    rect.bottom > bounds.bottom ||
    rect.left < bounds.left ||
    rect.right > bounds.right
  );
}

function findNearestScrollViewport(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
    if (/(auto|scroll|overlay)/.test(overflow)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function readScrollBounds(viewport: HTMLElement | null): RectLike {
  if (viewport) {
    return viewport.getBoundingClientRect();
  }

  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

function readScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function useAutoScrollIntoView<ElementType extends HTMLElement>(active: boolean) {
  const ref = useRef<ElementType | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) {
        return;
      }

      const viewport = findNearestScrollViewport(element);
      const elementBounds = element.getBoundingClientRect();
      const scrollBounds = readScrollBounds(viewport);

      if (!isRectOutsideVisibleBounds(elementBounds, scrollBounds)) {
        return;
      }

      element.scrollIntoView({
        behavior: readScrollBehavior(),
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [active]);

  return ref;
}
