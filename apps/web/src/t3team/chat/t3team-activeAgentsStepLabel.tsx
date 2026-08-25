import { useEffect, useState } from "react";
import { useActiveAgentHover } from "~/t3team/chat/t3team-activeAgentsCore";

/**
 * GHE #201 — "· <label>" for the conversation working row.
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
      setPhase("idle");
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
    <span className="t3team-aci-step ml-2 text-muted-foreground/55">
      ·{" "}
      <span
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
