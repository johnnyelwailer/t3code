import { useEffect, useState } from "react";

import type { T3TeamExplainer, T3TeamExplainerAskThread } from "../model/t3team-explainer";
import type { ExplainerAskHandler } from "../t3team-explainerContext";
import type { ExplainerStatus } from "../t3team-ExplainerHeader";
import { ExplainerPlayer } from "../t3team-ExplainerPlayer";
import { conceptAttachments, sampleWidget } from "./t3team-explainerConcept.fixtures";
import { uiAttachments } from "./t3team-explainerUi.fixtures";

const ATTACHMENTS: Readonly<Record<string, string>> = { ...uiAttachments, ...conceptAttachments };

const NO_THREADS: ReadonlyArray<T3TeamExplainerAskThread> = [];

const CANNED_ANSWER =
  "Short answer: yes. The loader returns cached rows first. The refresh runs after, and the rows update when it lands.";

/**
 * Story-only host for the player: keeps ask threads in state and types a canned answer word by
 * word, logs "Add to chat" and "Open in Code", resolves attachments and the sample widget the
 * way the app would, and can stream the steps in like a live run.
 */
export function ExplainerStoryHarness({
  explainer,
  width,
  threads: initialThreads = NO_THREADS,
  status,
  currentHeadSha,
  streamSteps = false,
  autoPlay,
  initialStep,
  stepMs,
}: {
  explainer: T3TeamExplainer;
  width: number;
  threads?: ReadonlyArray<T3TeamExplainerAskThread>;
  status?: ExplainerStatus;
  currentHeadSha?: string;
  /** Reveal steps one by one, as a generating run would. */
  streamSteps?: boolean;
  autoPlay?: boolean;
  initialStep?: number;
  stepMs?: number;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [log, setLog] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(streamSteps ? 2 : explainer.steps.length);

  useEffect(() => {
    if (!streamSteps || revealed >= explainer.steps.length) return;
    const timer = window.setTimeout(() => setRevealed(revealed + 1), 2600);
    return () => window.clearTimeout(timer);
  }, [explainer.steps.length, revealed, streamSteps]);

  const onAsk: ExplainerAskHandler = ({ anchor, question, threadId }) => {
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
        : [
            ...current,
            {
              id,
              anchor,
              messages: [reader, agent],
              ...(explainer.headSha ? { headSha: explainer.headSha } : {}),
            },
          ];
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
  const liveStatus: ExplainerStatus | undefined =
    streamSteps && revealed < explainer.steps.length
      ? { kind: "generating", expectedSteps: explainer.steps.length }
      : status;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div style={{ width, maxWidth: "100%" }} className="mx-auto">
        <ExplainerPlayer
          explainer={shown}
          threads={threads}
          onAsk={onAsk}
          onAddToChat={(input) =>
            setLog(`Add to chat → ${input.comment.rangeLabel} · ${input.comment.sectionTitle}`)
          }
          onOpenInCode={(target) =>
            setLog(
              `Open in Code → ${target.path}:${target.line}${target.headSha ? ` @ ${target.headSha.slice(0, 7)}` : ""}`,
            )
          }
          resolveAttachment={(id) => ATTACHMENTS[id]}
          resolveWidget={(id) => (id === sampleWidget.widgetId ? sampleWidget : undefined)}
          onRegenerate={() => setLog("Regenerate requested")}
          {...(liveStatus ? { status: liveStatus } : {})}
          {...(currentHeadSha ? { currentHeadSha } : {})}
          {...(autoPlay === undefined ? {} : { autoPlay })}
          {...(initialStep === undefined ? {} : { initialStep })}
          {...(stepMs === undefined ? {} : { stepMs })}
        />
        <p className="mt-2 min-h-4 font-mono text-2xs text-muted-foreground" aria-live="polite">
          {log}
        </p>
      </div>
    </div>
  );
}
