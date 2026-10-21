import { useEffect, useRef, type RefObject } from "react";

import { beginFrame, drawBars, drawRibbon } from "./t3team-voiceCanvasDraw";
import { resolveVoicePalette } from "./t3team-voiceCanvasPalette";
import { VoiceLevelHistory } from "./t3team-voiceLevelHistory";
import { readVoiceLevel } from "./t3team-voiceUiStore";

export type VoiceCanvasKind = "ribbon" | "bars";

const REDUCED_MOTION_FRAME_MS = 200;
const MAX_STEP_SECONDS = 0.05;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Draws the live input level on a canvas while `active`, and mirrors the smoothed level into the
 * `--voice-level` custom property of `glowRef` for CSS glows that breathe with the voice. The
 * loop reads the store without subscribing, so a level event never re-renders anything.
 */
export function useVoiceCanvas(input: {
  readonly kind: VoiceCanvasKind;
  readonly active: boolean;
  readonly glowRef?: RefObject<HTMLElement | null>;
}): RefObject<HTMLCanvasElement | null> {
  const { kind, active, glowRef } = input;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || canvas === null) return;
    const history = new VoiceLevelHistory();
    const reduced = prefersReducedMotion();
    let frameId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(MAX_STEP_SECONDS, (now - last) / 1000);
      last = now;
      const level = history.step(readVoiceLevel(), dt);
      glowRef?.current?.style.setProperty("--voice-level", level.toFixed(3));
      const frame = beginFrame(
        canvas,
        () => resolveVoicePalette(canvas),
        history,
        reduced ? 0 : now / 1000,
      );
      if (frame !== null) (kind === "ribbon" ? drawRibbon : drawBars)(frame);
      if (reduced)
        frameId = window.setTimeout(() => tick(performance.now()), REDUCED_MOTION_FRAME_MS);
      else frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      if (reduced) window.clearTimeout(frameId);
      else cancelAnimationFrame(frameId);
      glowRef?.current?.style.removeProperty("--voice-level");
    };
  }, [active, kind, glowRef]);

  return canvasRef;
}
