import { useMemo } from "react";

import type { T3TeamExplainer, T3TeamExplainerAskThread } from "./model/t3team-explainer";
import type { ExplainerApi, ExplainerHost } from "./t3team-explainerContext";
import type { useExplainerAskController } from "./t3team-useExplainerAskController";

/** The context every block reads, kept stable so blocks re-render only on a real change. */
export function useExplainerApi(input: {
  readonly host: ExplainerHost;
  readonly explainer: T3TeamExplainer;
  readonly staleSha: string | undefined;
  readonly reducedMotion: boolean;
  readonly streaming: boolean;
  readonly threads: ReadonlyArray<T3TeamExplainerAskThread>;
  readonly ask: ReturnType<typeof useExplainerAskController>;
  readonly canAsk: boolean;
  readonly canAddToChat: boolean;
}): ExplainerApi {
  const { explainer, staleSha, reducedMotion, streaming, threads, canAsk, canAddToChat } = input;
  const { resolveAttachment, resolveWidget, widgetThreadRef, onOpenInCode } = input.host;
  const { openAsk, addToChat } = input.ask;
  const activeKey = input.ask.open?.key ?? null;
  return useMemo(
    () => ({
      explainer,
      staleSha,
      reducedMotion,
      streaming,
      threads,
      activeKey,
      canAsk,
      canAddToChat,
      openAsk,
      addToChat,
      resolveAttachment,
      resolveWidget,
      widgetThreadRef,
      onOpenInCode,
    }),
    [
      activeKey,
      addToChat,
      canAddToChat,
      canAsk,
      explainer,
      onOpenInCode,
      openAsk,
      reducedMotion,
      resolveAttachment,
      resolveWidget,
      staleSha,
      streaming,
      threads,
      widgetThreadRef,
    ],
  );
}
