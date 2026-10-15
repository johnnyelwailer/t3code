// @effect-diagnostics globalTimers:off - Display timing for React hooks, outside an Effect runtime.

/** How long a status must last before a client shows it. */
export const STATUS_SHOW_DELAY_MS = 400;
/** How long a shown status stays up, so it cannot flash at the show delay. */
export const STATUS_MIN_VISIBLE_MS = 400;

/** The status a client should show, and the key it belongs to. */
export interface ShownStatus<A> {
  readonly key: string;
  readonly value: A;
}

/** Overrides for one status; a slow-changing surface can ask for longer than the shared defaults. */
export interface DelayedStatusTiming {
  readonly showDelayMs?: number;
  readonly minVisibleMs?: number;
}

export interface DelayedStatus<A> {
  /** Reports the real status for `key`. A new key drops the shown status at once. */
  readonly update: (key: string, value: A | null) => void;
  /** Cancels pending timers. A later `update` starts again from the real status. */
  readonly dispose: () => void;
}

/**
 * Turns a real status (for example the thread sync phase) into the status a
 * client shows. A status that clears within `STATUS_SHOW_DELAY_MS` is never
 * shown. A shown status stays for at least `STATUS_MIN_VISIBLE_MS`. Values
 * compare by identity, so use strings or other stable values.
 *
 * Web and mobile wrap this in a small `useDelayedStatus` hook.
 */
export function createDelayedStatus<A>(
  onChange: (shown: ShownStatus<A> | null) => void,
  timing: DelayedStatusTiming = {},
): DelayedStatus<A> {
  const showDelayMs = timing.showDelayMs ?? STATUS_SHOW_DELAY_MS;
  const minVisibleMs = timing.minVisibleMs ?? STATUS_MIN_VISIBLE_MS;
  let key = "";
  let latest: A | null = null;
  let shown: A | null = null;
  // While hidden, this is the show delay. While shown, the minimum visible time.
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const hide = () => {
    shown = null;
    onChange(null);
  };
  // Every shown value, including a new label, gets the full minimum visible time.
  const show = (value: A) => {
    shown = value;
    onChange({ key, value });
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (latest === null) hide();
    }, minVisibleMs);
  };

  return {
    update: (nextKey, value) => {
      if (nextKey !== key) {
        key = nextKey;
        clearTimer();
        if (shown !== null) hide();
      }
      latest = value;

      if (shown === null) {
        if (value === null) {
          clearTimer();
        } else if (timer === undefined) {
          timer = setTimeout(() => {
            timer = undefined;
            if (latest !== null) show(latest);
          }, showDelayMs);
        }
        return;
      }

      if (value !== null) {
        if (value !== shown) show(value);
      } else if (timer === undefined) {
        hide();
      }
    },
    dispose: clearTimer,
  };
}
