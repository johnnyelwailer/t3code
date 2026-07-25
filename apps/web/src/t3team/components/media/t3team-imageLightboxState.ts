/** One viewable image: a resolved `src` for the `<img>`, optional alt text, and an "open
 * original" target that may differ from `src` (e.g. a signed thumbnail vs. the full asset). */
export type T3TeamLightboxImage = {
  readonly src: string;
  readonly alt: string;
  readonly href?: string | undefined;
};

/** Wraps forward past the last image back to the first. A single- or zero-image gallery is a
 * no-op — there is nowhere else to go. */
export function t3teamLightboxNextIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current + 1) % total;
}

/** Wraps backward past the first image to the last. */
export function t3teamLightboxPrevIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current - 1 + total) % total;
}

/** Zoom-to-fit shows the whole image within the viewport; actual size shows it at native
 * resolution inside a scrollable viewport. */
export type T3TeamLightboxZoom = "fit" | "actual";

export type T3TeamLightboxState = { readonly index: number | undefined };

export type T3TeamLightboxAction =
  | { readonly type: "open"; readonly index: number }
  | { readonly type: "close" }
  | { readonly type: "next"; readonly total: number }
  | { readonly type: "prev"; readonly total: number };

/**
 * The lightbox's entire open/close/navigate behaviour as a pure reducer, so it is testable
 * without mounting the dialog. `next`/`prev` are no-ops while closed — there is nothing to
 * navigate away from.
 */
export function t3teamLightboxReducer(
  state: T3TeamLightboxState,
  action: T3TeamLightboxAction,
): T3TeamLightboxState {
  switch (action.type) {
    case "open":
      return { index: action.index };
    case "close":
      return { index: undefined };
    case "next":
      return state.index === undefined
        ? state
        : { index: t3teamLightboxNextIndex(state.index, action.total) };
    case "prev":
      return state.index === undefined
        ? state
        : { index: t3teamLightboxPrevIndex(state.index, action.total) };
    default:
      return state;
  }
}
