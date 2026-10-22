/**
 * My Work's first load, from greeting to content, without a flash or a jump.
 *
 * `loading` says whether the content can render yet; the greeting's timing is decided by
 * t3team-myWorkFirstLoadReveal.ts (delayed reveal, minimum dwell, one session across the startup
 * gate → My Work hand-off). When the greeting leaves it cross-fades over the content in the same
 * box: the greeting is pinned over the content's top-left corner, the content takes its place in
 * the flow, so nothing reflows. Under `prefers-reduced-motion` the swap is instant.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";
import {
  acquireFirstLoadSession,
  CROSS_FADE_MS,
  finishFirstLoadSession,
  holdFirstLoadSession,
  markFirstLoadShown,
  releaseFirstLoadSession,
  resolveFirstLoadPhase,
  type FirstLoadPhase,
} from "~/t3team/t3team-myWorkFirstLoadReveal";

export function useMyWorkFirstLoadPhase(loading: boolean): {
  readonly phase: FirstLoadPhase;
  /** How long the greeting has already been visible when this mount took it over (0 if fresh). */
  readonly continuedMs: number;
} {
  const [session] = useState(() => acquireFirstLoadSession(Date.now()));
  const [continuedMs] = useState(() =>
    session.shownAt === null ? 0 : Math.max(0, Date.now() - session.shownAt),
  );
  const [now, setNow] = useState(() => Date.now());
  const decision = resolveFirstLoadPhase({
    loading,
    now,
    startedAt: session.startedAt,
    shownAt: session.shownAt,
  });
  const completedRef = useRef(false);
  useEffect(() => {
    completedRef.current = decision.phase === "content";
    // Content is up: this first load is over, the next one (another scope) gets its own delay.
    if (completedRef.current) finishFirstLoadSession(session);
  }, [decision.phase, session]);

  useEffect(() => {
    holdFirstLoadSession(session);
    return () =>
      releaseFirstLoadSession(session, { completed: completedRef.current, now: Date.now() });
  }, [session]);

  // `now` is the moment this render decided to reveal (a timer tick or the mount itself).
  useEffect(() => {
    if (decision.phase === "placeholder") markFirstLoadShown(session, now);
  }, [decision.phase, now, session]);

  useEffect(() => {
    if (decision.wakeAt === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, decision.wakeAt - Date.now()));
    return () => clearTimeout(timer);
  }, [decision.wakeAt]);

  return { phase: decision.phase, continuedMs };
}

/**
 * The greeting alone, for a screen that cannot render its content component yet (the project list
 * is still being assembled). It joins the same session, so the next swap continues it.
 */
export function MyWorkFirstLoadPlaceholder() {
  return <MyWorkFirstLoadSwap loading>{null}</MyWorkFirstLoadSwap>;
}

export function MyWorkFirstLoadSwap({
  loading,
  children,
  className,
  contentClassName,
  renderPlaceholder,
}: {
  readonly loading: boolean;
  /** The content; only mounted once `loading` is false and the greeting's dwell is over. */
  readonly children: ReactNode;
  readonly className?: string;
  /** The content's own box (the greeting fades over it); full-height screens pass their flex column. */
  readonly contentClassName?: string;
  /** Wraps the greeting in the same frame the content will use (header, column, …). */
  readonly renderPlaceholder?: (greeting: ReactNode) => ReactNode;
}) {
  const { phase, continuedMs } = useMyWorkFirstLoadPhase(loading);
  // The greeting fades out over the content after a visible phase; a pending one just goes.
  const [shownPhase, setShownPhase] = useState(phase);
  const [exiting, setExiting] = useState(false);
  const [quickIn, setQuickIn] = useState(false);
  if (phase !== shownPhase) {
    if (shownPhase === "placeholder" && phase === "content") setExiting(true);
    // Content that beat the reveal delay was never preceded by anything visible: a short fade in
    // keeps it from popping into the blank.
    if (shownPhase === "pending" && phase === "content") setQuickIn(true);
    setShownPhase(phase);
  }
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setExiting(false), CROSS_FADE_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  const greeting = (
    <MyWorkLoadingAnimation
      continuedMs={continuedMs}
      {...(phase === "pending" ? { hidden: true } : {})}
    />
  );
  const framed = renderPlaceholder ? renderPlaceholder(greeting) : greeting;

  if (phase !== "content") {
    return <div className={cn("relative", className)}>{framed}</div>;
  }
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          contentClassName,
          exiting && "t3team-mywork-first-load-content-in",
          quickIn && "t3team-mywork-first-load-content-quick-in",
        )}
        data-first-load="content"
      >
        {children}
      </div>
      {exiting ? (
        <div
          aria-hidden
          inert
          className="t3team-mywork-first-load-greeting-out pointer-events-none absolute inset-0 overflow-hidden"
        >
          {framed}
        </div>
      ) : null}
    </div>
  );
}
