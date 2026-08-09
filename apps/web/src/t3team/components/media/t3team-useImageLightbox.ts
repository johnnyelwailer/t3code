import { useCallback, useEffect, useReducer, useRef } from "react";

import { t3teamLightboxReducer, type T3TeamLightboxImage } from "./t3team-imageLightboxState";

export type T3TeamImageLightboxController = {
  /** `undefined` while closed. */
  readonly index: number | undefined;
  readonly image: T3TeamLightboxImage | undefined;
  readonly total: number;
  readonly openAt: (index: number) => void;
  readonly close: () => void;
  readonly next: () => void;
  readonly prev: () => void;
};

/**
 * Thin React binding over the pure `t3teamLightboxReducer`: one gallery scope's open index plus
 * the navigation callbacks the lightbox dialog needs. Callers own what `images` means for their
 * scope — all images in one ADF document, or all image attachments in one grid.
 *
 * Also owns "focus returns to the trigger": the lightbox dialog isn't opened via a `Dialog.Trigger`
 * (many different `<img>`/tile buttons across the tree can open the same shared instance), so the
 * underlying focus manager has no reference element to return to on its own. `openAt` is always
 * called synchronously from a click handler, so `document.activeElement` at that instant is
 * reliably the element the user clicked — capture it there, then focus it back once the dialog has
 * actually unmounted (the effect below, keyed on the open/closed transition).
 */
export function useT3TeamImageLightbox(
  images: readonly T3TeamLightboxImage[],
): T3TeamImageLightboxController {
  const [state, dispatch] = useReducer(t3teamLightboxReducer, { index: undefined });
  const total = images.length;
  const triggerRef = useRef<HTMLElement | null>(null);
  const isOpen = state.index !== undefined;

  const openAt = useCallback((index: number) => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: "open", index });
  }, []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const next = useCallback(() => dispatch({ type: "next", total }), [total]);
  const prev = useCallback(() => dispatch({ type: "prev", total }), [total]);

  useEffect(() => {
    if (isOpen) return;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    trigger?.focus();
  }, [isOpen]);

  const image = state.index === undefined ? undefined : images[state.index];

  return { index: state.index, image, total, openAt, close, next, prev };
}
