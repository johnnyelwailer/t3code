import type {
  T3TeamPrExplainer,
  T3TeamPrExplainerAnchor,
  T3TeamPrExplainerAskThread,
} from "@t3tools/contracts";
import { createContext, useContext } from "react";

import type { PullRequestAgentSelectionInput } from "~/components/pullRequest/PullRequestCodeTab";

/** Where a reader's question about one spot goes. `threadId` is set for a reply. */
export type PrExplainerAskHandler = (input: {
  readonly anchor: T3TeamPrExplainerAnchor;
  readonly question: string;
  readonly threadId?: string;
}) => void;

/** Same callback shape as the PR panel's `onAddToAgentSelection`. */
export type PrExplainerAddToChatHandler = (input: PullRequestAgentSelectionInput) => void;

export interface PrExplainerOpenInCodeTarget {
  readonly path: string;
  readonly line: number;
  readonly side: "old" | "new";
}

/** The ask surface every askable part of the player reaches through. */
export interface PrExplainerAskApi {
  readonly explainer: T3TeamPrExplainer;
  readonly threads: ReadonlyArray<T3TeamPrExplainerAskThread>;
  readonly activeKey: string | null;
  readonly canAsk: boolean;
  readonly canAddToChat: boolean;
  /** Opens the Ask card at `at` (the element or selection box it points from). */
  readonly openAsk: (anchor: T3TeamPrExplainerAnchor, at: Element | DOMRect) => void;
  readonly addToChat: (anchor: T3TeamPrExplainerAnchor, request?: string) => void;
}

export const PrExplainerAskContext = createContext<PrExplainerAskApi | null>(null);

export function usePrExplainerAsk(): PrExplainerAskApi {
  const api = useContext(PrExplainerAskContext);
  if (!api) throw new Error("usePrExplainerAsk is used outside PrExplainerPlayer");
  return api;
}
