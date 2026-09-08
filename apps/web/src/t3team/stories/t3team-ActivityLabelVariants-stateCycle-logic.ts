/**
 * GHE-40 activity label — story support: the state-cycle timer + fit-gate
 * measurement for the live state machine card (StateCycleCard).
 *
 * Split from t3team-ActivityLabelVariants-stateCycle.tsx (LOC ceiling).
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export const DEMO_STATES = [
  { key: "live1", kind: "live", text: "Reading tests" },
  { key: "live2", kind: "live", text: "Running the full checkout matrix across worktrees" },
  { key: "idle", kind: "idle", text: "Waiting" },
  { key: "done", kind: "done", text: "Done" },
] as const;

export type DemoState = (typeof DEMO_STATES)[number];

/** Card that cycles live → live → Waiting → Done on its own timer. */
export function useStateCycle(
  cardRef: RefObject<HTMLDivElement | null>,
  sizersRef: RefObject<HTMLSpanElement | null>,
) {
  const [i, setI] = useState(0);
  const [spinState, setSpinState] = useState({ tick: 0, instant: false });
  const [measure, setMeasure] = useState<{ avail: number; labelW: Record<string, number> } | null>(
    null,
  );
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setI((v) => {
        lastRef.current = v;
        return (v + 1) % DEMO_STATES.length;
      });
      setSpinState((s) => ({ tick: s.tick + 1, instant: false }));
      const next = DEMO_STATES[(lastRef.current! + 1) % DEMO_STATES.length];
      // the long label stays long enough to show its full cycle
      t = window.setTimeout(tick, next?.key === "live2" ? 47000 : 6000);
    };
    t = window.setTimeout(tick, 6000);
    return () => window.clearTimeout(t);
  }, []);
  const state = DEMO_STATES[i] ?? (DEMO_STATES[0] as DemoState);
  const last = lastRef.current;
  const previous = last === null ? null : (DEMO_STATES[last] ?? null);
  const liveToLive = previous?.kind === "live" && state.kind === "live";
  /* FIT GATE: the demo states are static, so every natural width is measured
     ONCE at mount (hidden sizers, same font context as the status) and the
     gate is a pure comparison at render time:
     label + icon + gaps + timer (≈58px) vs. the space left of the card
     (card width − row insets − favicon − gap − project title). When the
     label is wider than the space, the card switches to slide-pass mode. */
  useLayoutEffect(() => {
    const card = cardRef.current;
    const sizers = sizersRef.current;
    if (!card || !sizers) return;
    const cr = card.getBoundingClientRect();
    const contentW = cr.width - 20; // row content inset, both sides
    const project = sizers.querySelector<HTMLElement>('[data-sizer="__project"]');
    const avail = contentW - 16 - 6 - (project ? project.offsetWidth : 0);
    const labelW: Record<string, number> = {};
    for (const s of DEMO_STATES) {
      const el = sizers.querySelector<HTMLElement>(`[data-sizer="${s.key}"]`);
      labelW[s.key] = el ? el.offsetWidth : 0;
    }
    setMeasure({ avail, labelW });
  }, []);
  const over = measure ? (measure.labelW[state.key] ?? 0) + 58 > measure.avail : false;
  return { i, state, previous, liveToLive, spinState, setSpinState, measure, over };
}
