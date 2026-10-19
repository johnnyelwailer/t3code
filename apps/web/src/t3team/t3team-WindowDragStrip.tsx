import type { ComponentType } from "react";

import { isElectron } from "~/env";

/**
 * The desktop window's drag strip: one band across the top of every routed view.
 *
 * Electron resolves `-webkit-app-region` rectangles in document order — where two overlap, the
 * later one wins, whatever their z-index. Mounted once at the root, ahead of every route, this
 * strip lets the whole top band drag the window, so no view has to opt in to being draggable.
 * Everything rendered after it that opts out with `no-drag` stays clickable: controls inside a
 * `.drag-region` header, floating titlebar toggles, and portaled popups.
 */
export function T3TeamWindowDragStrip() {
  return isElectron ? <div aria-hidden className="window-drag-strip" /> : null;
}

/** Wraps a root route view so the strip precedes everything the route renders. */
export function withT3TeamWindowDragStrip<Props extends object>(View: ComponentType<Props>) {
  return function WithT3TeamWindowDragStrip(props: Props) {
    return (
      <>
        <T3TeamWindowDragStrip />
        <View {...props} />
      </>
    );
  };
}
