import { useEffect, useState } from "react";

/**
 * SplitFlipText — the production 3D status roll as a reusable primitive.
 *
 * Renders one string; when it changes, the old value rolls out
 * (`t3team-aci-flip-out`), the new value mounts and rolls in
 * (`t3team-aci-flip-in`) — the same keyframe pair the t3team step label
 * uses (t3team-index.css). The remount is what replays the keyframes
 * (a `key` on the span); do not remove it.
 *
 * `shouldFlip` gates the roll on the change itself: returning false
 * swaps the text in place with NO animation — used for per-second timer
 * ticks, where only shape changes (9s → 10s, 59s → 1m 0s) roll and plain
 * digit ticks just update.
 *
 * Compose several SplitFlipText pieces inside a width-transitioning
 * container for the "each text part flips on its own" effect.
 */
export function SplitFlipText({
  text,
  ms = 460,
  shouldFlip,
  className,
  onPhaseChange,
}: {
  readonly text: string;
  /** Duration of each half of the roll in ms (out, then in). */
  readonly ms?: number;
  /** Return false to swap without the roll. */
  readonly shouldFlip?: (prev: string, next: string) => boolean;
  readonly className?: string;
  /** Observes the roll phases ("out" -> swapping, "in" -> new text mounted). */
  readonly onPhaseChange?: (phase: "idle" | "out" | "in") => void;
}) {
  const [shown, setShown] = useState(text);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");

  useEffect(() => {
    onPhaseChange?.(phase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (text === shown) {
      // The "in" phase settles via its own timer; the guard keeps that
      // commit from stripping the flip-in class after one frame.
      if (phase !== "in") setPhase("idle");
      return;
    }
    if (shouldFlip && !shouldFlip(shown, text)) {
      if (phase === "idle") setShown(text); // quiet swap, no roll
      // Mid-roll: let the current roll settle; the effect re-runs when
      // the phase returns to idle and picks the new text up then.
      return;
    }
    if (phase === "idle") setPhase("out");
  }, [text, shown, phase, shouldFlip]);

  useEffect(() => {
    if (phase === "out") {
      const t = window.setTimeout(() => {
        setShown(text);
        setPhase("in");
      }, ms);
      return () => window.clearTimeout(t);
    }
    if (phase === "in") {
      const t = window.setTimeout(() => setPhase("idle"), ms);
      return () => window.clearTimeout(t);
    }
  }, [phase, text, ms]);

  const phaseClass =
    phase === "out" ? "t3team-aci-flip-out" : phase === "in" ? "t3team-aci-flip-in" : undefined;

  return (
    <span
      key={shown}
      className={className ? `${phaseClass ?? ""} ${className}`.trim() : phaseClass}
    >
      {shown}
    </span>
  );
}
