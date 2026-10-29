import { useEffect, useRef } from "react";

/**
 * Opening a file that changed since it was viewed re-marks it viewed, once per opening. The
 * decision is kept apart from the effect so that "once" is something a test can pin down.
 */
export interface OpenClearStep {
  readonly handled: string | null;
  readonly clear: boolean;
}

/**
 * `opened` names the open file together with the scope it is open in. An opening is handled only
 * once the host has answered: a file that turns out to have changed under the reader afterwards
 * (a push while it is on screen) keeps its marker until they leave it and come back.
 */
export function stepOpenClear(
  handled: string | null,
  opened: string | null,
  ready: boolean,
  changed: boolean,
): OpenClearStep {
  if (opened === null) return { handled: null, clear: false };
  if (!ready || handled === opened) return { handled, clear: false };
  return { handled: opened, clear: changed };
}

export function useClearChangedOnOpen(options: {
  /** The scope the file is open in, so reopening it after a commit or pull request switch counts. */
  readonly scope: string;
  readonly openedPath: string | null;
  readonly ready: boolean;
  readonly isChanged: (path: string) => boolean;
  readonly markViewed: (path: string) => void;
}): void {
  const { scope, openedPath, ready, isChanged, markViewed } = options;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const opened = openedPath === null ? null : `${scope}\n${openedPath}`;
    const step = stepOpenClear(
      handled.current,
      opened,
      ready,
      openedPath !== null && isChanged(openedPath),
    );
    handled.current = step.handled;
    if (step.clear && openedPath !== null) markViewed(openedPath);
  }, [isChanged, markViewed, openedPath, ready, scope]);
}
