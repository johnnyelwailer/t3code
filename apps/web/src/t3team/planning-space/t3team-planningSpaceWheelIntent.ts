/**
 * Wheel input classification for the planning space stage.
 *
 * Convention (documented in the PR, Miro-style for mice, Figma-style for trackpads):
 *
 *   Mouse wheel (discrete notches)
 *     wheel            → zoom toward the pointer
 *     Shift + wheel    → pan horizontally
 *     Ctrl/⌘ + wheel   → pan vertically
 *   Trackpad (continuous, fractional deltas)
 *     two-finger scroll → pan (both axes)
 *     pinch (ctrlKey)   → zoom toward the pointer
 *
 * Pinch on macOS and on Windows precision touchpads is reported as a wheel event
 * with ctrlKey=true, so device detection must run BEFORE the modifier mapping:
 * Ctrl + a discrete notch is a mouse user asking to pan vertically, Ctrl + a
 * small fractional delta is a pinch.
 */

export type WheelDevice = "mouse" | "trackpad";

export type WheelIntent =
  | { kind: "zoom"; delta: number }
  | { kind: "pan"; dx: number; dy: number };

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Legacy non-standard WebKit/Blink field: ±120 multiples for wheel notches. */
  wheelDeltaY?: number;
  wheelDeltaX?: number;
  timeStamp: number;
}

const LINE_PX = 40;
const PAGE_PX = 800;
/** Within one gesture stream, keep the first classification (avoids flicker
 *  when a trackpad momentum tail emits an integer-looking delta). */
const STICKY_MS = 250;

function isNotchMultiple(value: number | undefined): boolean {
  if (value === undefined || value === 0) return false;
  return Math.abs(value) % 120 === 0;
}

/** Stateless best guess for one event. */
export function classifyWheelDevice(sample: WheelSample): WheelDevice {
  // Firefox (and some Linux/Windows drivers) report mouse notches in lines/pages.
  if (sample.deltaMode !== 0) return "mouse";
  const ax = Math.abs(sample.deltaX);
  const ay = Math.abs(sample.deltaY);
  // Trackpads produce diagonal motion; a notch never has both axes set
  // (Shift+wheel on Windows moves the notch onto deltaX with deltaY 0).
  if (ax !== 0 && ay !== 0) return "trackpad";
  const d = ax || ay;
  if (d === 0) return "trackpad";
  // Chromium/WebKit legacy: wheel notches are exact ±120 multiples, while
  // trackpads report wheelDelta = -3 × delta (small, not 120-aligned).
  const legacy = ay !== 0 ? sample.wheelDeltaY : sample.wheelDeltaX;
  if (isNotchMultiple(legacy)) return "mouse";
  if (legacy !== undefined && legacy !== 0) {
    // Legacy field present but not notch-aligned → continuous device…
    // unless the delta is a big integer (high-DPI scaled notches, e.g. 125%
    // Windows scaling yields deltaY 125 / wheelDelta 150).
    return Number.isInteger(d) && d >= 50 ? "mouse" : "trackpad";
  }
  // No legacy field: fractional or small deltas are continuous.
  if (!Number.isInteger(d)) return "trackpad";
  return d >= 50 ? "mouse" : "trackpad";
}

export interface WheelClassifier {
  device(sample: WheelSample): WheelDevice;
}

export function createWheelClassifier(): WheelClassifier {
  let last: { device: WheelDevice; at: number } | null = null;
  return {
    device(sample) {
      const fresh = classifyWheelDevice(sample);
      // A notch-shaped event is decisive; otherwise stick to the running stream.
      const decisive = sample.deltaMode !== 0 || isNotchMultiple(sample.wheelDeltaY);
      const device =
        !decisive && last && sample.timeStamp - last.at < STICKY_MS ? last.device : fresh;
      last = { device, at: sample.timeStamp };
      return device;
    },
  };
}

function toPx(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

/**
 * Map a wheel sample to a camera intent. `zoom.delta` is in the units
 * `engine.zoomAtCursor` expects (positive = zoom out).
 */
export function wheelIntent(sample: WheelSample, device: WheelDevice): WheelIntent {
  const dx = toPx(sample.deltaX, sample.deltaMode);
  const dy = toPx(sample.deltaY, sample.deltaMode);
  if (device === "trackpad") {
    if (sample.ctrlKey || sample.metaKey) {
      // Pinch: small fractional deltas need a stronger multiplier.
      return { kind: "zoom", delta: dy * (Math.abs(dy) < 50 ? 14 : 4) };
    }
    return { kind: "pan", dx: -dx, dy: -dy };
  }
  // Mouse wheel.
  if (sample.shiftKey) {
    // Some platforms already move Shift+wheel onto deltaX.
    return { kind: "pan", dx: -(dx || dy), dy: 0 };
  }
  if (sample.ctrlKey || sample.metaKey) {
    return { kind: "pan", dx: 0, dy: -(dy || dx) };
  }
  return { kind: "zoom", delta: (dy || dx) * 4 };
}
