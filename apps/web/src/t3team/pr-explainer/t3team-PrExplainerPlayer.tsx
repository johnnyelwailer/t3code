import type { T3TeamPrExplainer, T3TeamPrExplainerAskThread } from "@t3tools/contracts";
import { useCallback, useRef } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

import {
  PrExplainerAskContext,
  type PrExplainerAddToChatHandler,
  type PrExplainerAskHandler,
  type PrExplainerOpenInCodeTarget,
} from "./t3team-prExplainerAskContext";
import { PrExplainerAskCard, PrExplainerSelectionChip } from "./t3team-PrExplainerAskCard";
import { PrExplainerControls } from "./t3team-PrExplainerControls";
import {
  PrExplainerHeader,
  PrExplainerStatusBanner,
  type PrExplainerStatus,
} from "./t3team-PrExplainerHeader";
import { PrExplainerRail } from "./t3team-PrExplainerRail";
import { PrExplainerStepView } from "./t3team-PrExplainerStep";
import { usePrExplainerAskController } from "./t3team-usePrExplainerAskController";
import { usePrExplainerPlayer } from "./t3team-usePrExplainerPlayer";

export interface PrExplainerPlayerProps {
  readonly explainer: T3TeamPrExplainer;
  readonly status?: PrExplainerStatus;
  /** The pull request's head now; differing from `explainer.headSha` marks it stale. */
  readonly currentHeadSha?: string;
  readonly threads?: ReadonlyArray<T3TeamPrExplainerAskThread>;
  readonly onAsk?: PrExplainerAskHandler;
  /** Same shape as the PR panel's `onAddToAgentSelection`. */
  readonly onAddToChat?: PrExplainerAddToChatHandler;
  readonly onOpenInCode?: (target: PrExplainerOpenInCodeTarget) => void;
  readonly onRegenerate?: () => void;
  readonly autoPlay?: boolean;
  readonly initialStep?: number;
  readonly className?: string;
}

const NO_THREADS: ReadonlyArray<T3TeamPrExplainerAskThread> = [];
const READY: PrExplainerStatus = { kind: "ready" };

/**
 * The PR explainer player: an ordered story of steps, a map that morphs with them, and a tour
 * that plays through. Responsive by container width, so it fits the ~420px PR side panel, a
 * phone, and a wide pane alike.
 */
export function PrExplainerPlayer({
  explainer,
  status = READY,
  currentHeadSha,
  threads = NO_THREADS,
  onAsk,
  onAddToChat,
  onOpenInCode,
  onRegenerate,
  autoPlay,
  initialStep,
  className,
}: PrExplainerPlayerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const streaming = status.kind === "generating";
  const player = usePrExplainerPlayer({
    stepCount: explainer.steps.length,
    streaming,
    ...(initialStep === undefined ? {} : { initialIndex: initialStep }),
    ...(autoPlay === undefined ? {} : { autoPlay }),
  });
  const step = explainer.steps[player.index] ?? null;
  const { hold } = player;
  const holdAsk = useCallback((open: boolean) => hold("ask", open), [hold]);
  const ask = usePrExplainerAskController({
    rootRef,
    explainer,
    stepId: step?.id ?? null,
    threads,
    onAsk,
    onAddToChat,
    onOpenChange: holdAsk,
  });
  const failedEmpty = status.kind === "error" && explainer.steps.length === 0;
  const pending = streaming ? Math.max(0, status.expectedSteps - explainer.steps.length) : 0;

  return (
    <PrExplainerAskContext.Provider value={ask.api}>
      <section
        ref={rootRef}
        aria-label={`Explainer for pull request #${explainer.pullRequest.number}`}
        aria-roledescription="explainer player"
        // The player itself takes ←/→; it is focusable so the keys work after a click inside.
        tabIndex={-1}
        onKeyDown={player.onKeyDown}
        className={cn(
          "@container relative flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground outline-none @min-[34rem]:p-4",
          className,
        )}
      >
        <PrExplainerHeader explainer={explainer} />
        <PrExplainerStatusBanner
          explainer={explainer}
          status={status}
          currentHeadSha={currentHeadSha}
          onRegenerate={onRegenerate}
        />
        {failedEmpty ? null : (
          <PrExplainerRail steps={explainer.steps} pending={pending} player={player} />
        )}
        <div
          hidden={failedEmpty}
          className="min-h-40"
          // Looking at or working in the step holds the tour; the controls do not.
          onPointerEnter={() => hold("hover", true)}
          onPointerLeave={() => hold("hover", false)}
          onFocus={() => hold("focus", true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              hold("focus", false);
            }
          }}
        >
          {step ? (
            <PrExplainerStepView
              explainer={explainer}
              step={step}
              stepIndex={player.index}
              reducedMotion={player.reducedMotion}
              onOpenInCode={onOpenInCode}
            />
          ) : (
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}
        </div>
        {failedEmpty ? null : (
          <PrExplainerControls player={player} stepCount={explainer.steps.length} />
        )}
        {ask.chip && !ask.open ? (
          <PrExplainerSelectionChip placement={ask.chip} onOpen={ask.openChip} />
        ) : null}
        {ask.open ? (
          <PrExplainerAskCard
            key={`${ask.open.top}:${ask.open.left}`}
            placement={ask.open}
            onSubmit={ask.submit}
            onClose={ask.close}
          />
        ) : null}
      </section>
    </PrExplainerAskContext.Provider>
  );
}
