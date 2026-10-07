import { useEffect, useMemo, useRef, type FocusEvent, type KeyboardEvent } from "react";

import type { T3TeamExplainer, T3TeamExplainerAskThread } from "./model/t3team-explainer";
import { ExplainerAskCard, ExplainerSelectionChip } from "./t3team-ExplainerAskCard";
import { ExplainerOutdatedThreads } from "./t3team-ExplainerAskThread";
import {
  ExplainerContext,
  type ExplainerAddToChatHandler,
  type ExplainerAskHandler,
  type ExplainerHost,
} from "./t3team-explainerContext";
import { ExplainerControls } from "./t3team-ExplainerControls";
import {
  ExplainerHeader,
  ExplainerStatusBanner,
  type ExplainerStatus,
} from "./t3team-ExplainerHeader";
import { Skeleton, cn } from "./t3team-explainerHostKit";
import { ExplainerRail } from "./t3team-ExplainerRail";
import { ExplainerStepView } from "./t3team-ExplainerStep";
import { explainerStepLabel } from "./t3team-explainerStepKind";
import { partitionExplainerThreads } from "./t3team-explainerThreads";
import { useExplainerApi } from "./t3team-useExplainerApi";
import { useExplainerAskController } from "./t3team-useExplainerAskController";
import { useExplainerInView } from "./t3team-useExplainerInView";
import { useExplainerPlayer } from "./t3team-useExplainerPlayer";

export interface ExplainerPlayerProps extends ExplainerHost {
  readonly explainer: T3TeamExplainer;
  readonly status?: ExplainerStatus;
  /** The subject's head now; differing from `explainer.headSha` marks the explainer stale. */
  readonly currentHeadSha?: string;
  readonly threads?: ReadonlyArray<T3TeamExplainerAskThread>;
  readonly onAsk?: ExplainerAskHandler;
  /** Same shape as the PR panel's `onAddToAgentSelection`. */
  readonly onAddToChat?: ExplainerAddToChatHandler;
  readonly onRegenerate?: () => void;
  readonly autoPlay?: boolean;
  readonly initialStep?: number;
  /** One step's time at 1×. */
  readonly stepMs?: number;
  readonly className?: string;
}

const NO_THREADS: ReadonlyArray<T3TeamExplainerAskThread> = [];
const READY: ExplainerStatus = { kind: "ready" };

/**
 * The explainer player: an ordered story of steps, a map that morphs with them, and a tour that
 * plays through. Responsive by container width, so it fits the ~420px PR side panel, a phone and
 * a wide pane alike. It fetches nothing: data and every action arrive as props.
 */
export function ExplainerPlayer(props: ExplainerPlayerProps) {
  const { explainer, status = READY, currentHeadSha, threads = NO_THREADS } = props;
  const rootRef = useRef<HTMLElement>(null);
  const streaming = status.kind === "generating";
  const inView = useExplainerInView(rootRef);
  const player = useExplainerPlayer({
    stepCount: explainer.steps.length,
    streaming,
    inView,
    ...(props.initialStep === undefined ? {} : { initialIndex: props.initialStep }),
    ...(props.autoPlay === undefined ? {} : { autoPlay: props.autoPlay }),
    ...(props.stepMs === undefined ? {} : { stepMs: props.stepMs }),
  });
  const step = explainer.steps[player.index] ?? null;
  const staleSha =
    explainer.headSha && currentHeadSha && currentHeadSha !== explainer.headSha
      ? explainer.headSha
      : undefined;
  const { current, outdated } = useMemo(
    () => partitionExplainerThreads(explainer, threads),
    [explainer, threads],
  );
  const ask = useExplainerAskController({
    rootRef,
    explainer,
    stepId: step?.id ?? null,
    threads: current,
    staleSha,
    onAsk: props.onAsk,
    onAddToChat: props.onAddToChat,
  });
  const { hold } = player;
  const askOpen = ask.open !== null;
  useEffect(() => hold("ask", askOpen), [askOpen, hold]);

  const api = useExplainerApi({
    host: props,
    explainer,
    staleSha,
    reducedMotion: player.reducedMotion,
    streaming,
    threads: current,
    ask,
    canAsk: props.onAsk !== undefined,
    canAddToChat: props.onAddToChat !== undefined,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!player.onKeyDown(event)) return;
    // The focused control may belong to the step that is leaving: keep focus (and the keys) in
    // the player on the new active segment, and let go of the focus hold it carried.
    hold("focus", false);
    requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLElement>("[data-xp-rail-active] button")?.focus(),
    );
  };
  // Keyboard focus in the step holds the tour; a mouse click that leaves focus behind does not.
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.matches(":focus-visible")) {
      hold("focus", true);
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold("focus", false);
  };

  const failedEmpty = status.kind === "error" && explainer.steps.length === 0;
  const pending = streaming ? Math.max(0, status.expectedSteps - explainer.steps.length) : 0;

  return (
    <ExplainerContext.Provider value={api}>
      <section
        ref={rootRef}
        aria-label={`Explainer: ${explainer.summary}`}
        aria-roledescription="explainer player"
        // The player itself takes ←/→; it is focusable so the keys work after a click inside.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "@container relative flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground outline-none @min-[34rem]:p-4",
          props.className,
        )}
      >
        <ExplainerHeader explainer={explainer} />
        <ExplainerStatusBanner
          explainer={explainer}
          status={status}
          currentHeadSha={currentHeadSha}
          onRegenerate={props.onRegenerate}
        />
        {failedEmpty ? null : (
          <ExplainerRail steps={explainer.steps} pending={pending} player={player} />
        )}
        <div className="sr-only" aria-live="polite">
          {step
            ? `Step ${player.index + 1} of ${explainer.steps.length}, ${explainerStepLabel(step)}: ${step.caption}`
            : ""}
        </div>
        <div
          hidden={failedEmpty}
          className="min-h-40"
          onPointerEnter={() => hold("hover", true)}
          onPointerLeave={() => hold("hover", false)}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {step ? (
            <ExplainerStepView
              key={step.id}
              step={step}
              stepIndex={player.index}
              stepCount={explainer.steps.length}
            />
          ) : (
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}
        </div>
        {failedEmpty ? null : (
          <ExplainerControls player={player} stepCount={explainer.steps.length} />
        )}
        <ExplainerOutdatedThreads threads={outdated} />
        {ask.chip && !ask.open ? (
          <ExplainerSelectionChip top={ask.chip.top} left={ask.chip.left} onOpen={ask.openChip} />
        ) : null}
        <ExplainerAskCard open={ask.open} onSubmit={ask.submit} onClose={ask.close} />
      </section>
    </ExplainerContext.Provider>
  );
}
