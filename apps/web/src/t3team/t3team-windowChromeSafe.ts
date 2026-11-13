/**
 * Shared title-bar safe area: clear of Windows/Linux overlay (right) and macOS
 * traffic lights (left). Native close quits the app, so a page close moves,
 * it is not dropped. Left pad is always on; Mac has no `.wco`.
 */
export const T3TEAM_WINDOW_CHROME_SAFE_CLASS =
  "drag-region pl-(--workspace-controls-left) sm:pl-(--workspace-controls-left) wco:min-h-[env(titlebar-area-height,2.5rem)] wco:pr-(--workspace-native-controls-inset)";

/** Absolutely positioned close, moved clear of the native caption buttons. */
export const T3TEAM_WINDOW_CHROME_SAFE_ABSOLUTE_CLOSE_CLASS =
  "wco:top-[max(0.75rem,env(titlebar-area-y,0px))] wco:end-[var(--workspace-native-controls-inset)]";
