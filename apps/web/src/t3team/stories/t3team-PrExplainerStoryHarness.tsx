import type { T3TeamPrExplainer, T3TeamPrExplainerAskThread } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import type { PrExplainerStatus } from "~/t3team/pr-explainer/t3team-PrExplainerHeader";
import { PrExplainerPlayer } from "~/t3team/pr-explainer/t3team-PrExplainerPlayer";
import type { PrExplainerAskHandler } from "~/t3team/pr-explainer/t3team-prExplainerAskContext";

const NO_THREADS: ReadonlyArray<T3TeamPrExplainerAskThread> = [];

const CANNED_ANSWER =
  "Short answer: yes. The loader returns cached rows first. The refresh runs after, and the rows update when it lands.";

/**
 * Story-only host for the player: keeps ask threads in state and types a canned answer word by
 * word, logs "Add to chat" and "Open in Code", and can stream the steps in like a live run.
 */
export function PrExplainerStoryHarness({
  explainer,
  width,
  threads: initialThreads = NO_THREADS,
  status,
  currentHeadSha,
  streamSteps = false,
  autoPlay,
  initialStep,
}: {
  explainer: T3TeamPrExplainer;
  width: number;
  threads?: ReadonlyArray<T3TeamPrExplainerAskThread>;
  status?: PrExplainerStatus;
  currentHeadSha?: string;
  /** Reveal steps one by one, as a generating run would. */
  streamSteps?: boolean;
  autoPlay?: boolean;
  initialStep?: number;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [log, setLog] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(streamSteps ? 2 : explainer.steps.length);

  useEffect(() => {
    if (!streamSteps || revealed >= explainer.steps.length) return;
    const timer = window.setTimeout(() => setRevealed(revealed + 1), 2600);
    return () => window.clearTimeout(timer);
  }, [explainer.steps.length, revealed, streamSteps]);

  const onAsk: PrExplainerAskHandler = ({ anchor, question, threadId }) => {
    const id = threadId ?? `story-${Date.now()}`;
    const answerId = `${id}-a${Date.now()}`;
    setThreads((current) => {
      const reader = {
        id: `${answerId}-q`,
        author: "reader" as const,
        body: question,
        status: "done" as const,
      };
      const agent = {
        id: answerId,
        author: "agent" as const,
        body: "",
        status: "streaming" as const,
      };
      const existing = current.find((thread) => thread.id === id);
      return existing
        ? current.map((thread) =>
            thread.id === id
              ? { ...thread, messages: [...thread.messages, reader, agent] }
              : thread,
          )
        : [...current, { id, anchor, messages: [reader, agent] }];
    });
    const words = CANNED_ANSWER.split(" ");
    words.forEach((_, index) => {
      window.setTimeout(
        () => {
          const done = index === words.length - 1;
          setThreads((current) =>
            current.map((thread) => ({
              ...thread,
              messages: thread.messages.map((message) =>
                message.id === answerId
                  ? {
                      ...message,
                      body: words.slice(0, index + 1).join(" "),
                      status: done ? ("done" as const) : ("streaming" as const),
                    }
                  : message,
              ),
            })),
          );
        },
        120 * (index + 1),
      );
    });
  };

  const shown = streamSteps
    ? { ...explainer, steps: explainer.steps.slice(0, revealed) }
    : explainer;
  const liveStatus: PrExplainerStatus | undefined =
    streamSteps && revealed < explainer.steps.length
      ? { kind: "generating", expectedSteps: explainer.steps.length }
      : status;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div style={{ width, maxWidth: "100%" }} className="mx-auto">
        <PrExplainerPlayer
          explainer={shown}
          threads={threads}
          onAsk={onAsk}
          onAddToChat={(input) => setLog(`Add to chat → ${input.comment.rangeLabel}`)}
          onOpenInCode={(target) => setLog(`Open in Code → ${target.path}:${target.line}`)}
          onRegenerate={() => setLog("Regenerate requested")}
          {...(liveStatus ? { status: liveStatus } : {})}
          {...(currentHeadSha ? { currentHeadSha } : {})}
          {...(autoPlay === undefined ? {} : { autoPlay })}
          {...(initialStep === undefined ? {} : { initialStep })}
        />
        <p className="mt-2 min-h-4 font-mono text-2xs text-muted-foreground" aria-live="polite">
          {log}
        </p>
      </div>
    </div>
  );
}
