import { useEffect, useState } from "react";
import { useActiveAgentHover } from "~/t3team/chat/t3team-activeAgentsCore";

/**
 * GHE #201 — the "<label>" for the conversation working row.
 *
 * The base value (the plan step label, or the most recent agent's live
 * status when the main turn is idle) is debounced 900ms so fast
 * intermediate updates never flicker; hovering an agent dot flips the SAME
 * label to that agent's live status instead of appending text. The switch
 * is a sequential FLIP: the old text rotates fully out first, then the new
 * text rotates in. One line, ellipsis-clamped, so the row layout never
 * shifts.
 */

function useDebouncedValue(value: string, ms: number): string {
  const [stable, setStable] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setStable(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return stable;
}

export function T3TeamActiveAgentsStepLabel({ label }: { label: string | null }) {
  const hover = useActiveAgentHover();
  const stable = useDebouncedValue(label ?? "", 900);
  const target = hover ? `${hover.title} — ${hover.statusLabel}` : stable;
  const [shown, setShown] = useState(target);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");

  useEffect(() => {
    if (target === shown) {
      // The "in" phase settles itself via its own timer. Guarding on
      // phase !== "in" is what makes the sequential FLIP work: when the
      // out-timer commits setShown(target) + setPhase("in"), this effect
      // re-runs with target === shown ALREADY TRUE — without the guard it
      // would drop the phase back to "idle" within the same commit cycle
      // and strip the flip-in class after a single frame, so the new text
      // never spins and just pops in at full opacity.
      if (phase !== "in") setPhase("idle");
      return;
    }
    if (phase === "idle") setPhase("out");
  }, [target, shown, phase]);
  useEffect(() => {
    if (phase === "out") {
      const t = setTimeout(() => {
        setShown(target);
        setPhase("in");
      }, 460);
      return () => clearTimeout(t);
    }
    if (phase === "in") {
      const t = setTimeout(() => setPhase("idle"), 460);
      return () => clearTimeout(t);
    }
  }, [phase, target, shown]);

  if (target === "") return null;
  return (
    // GHE #208 follow-up: shrink-100 makes the step label the primary
    // shrink point — it surrenders nearly all the row's overflow, so a
    // narrow panel truncates (then vanishes) the label before the timer
    // text ellipsizes. Same rule as the solo working row's step label.
    <span className="t3team-aci-step ml-2 min-w-0 shrink-100 text-muted-foreground/55">
      <span
        key={shown}
        className={
          phase === "out"
            ? "t3team-aci-flip-out"
            : phase === "in"
              ? "t3team-aci-flip-in"
              : undefined
        }
      >
        {shown}
      </span>
    </span>
  );
}
