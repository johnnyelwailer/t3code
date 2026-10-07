import type {
  T3TeamExplainer,
  T3TeamExplainerAnchor,
  T3TeamExplainerAskThread,
} from "./model/t3team-explainer";
import {
  type PullRequestAgentSelectionInput,
  type ScopedThreadRef,
  type HostWidget,
} from "./t3team-explainerHostKit";
import { createContext, useContext } from "react";

import type { ExplainerOpenInCodeTarget } from "./t3team-explainerHandoff";

/** Where a reader's question about one spot goes. `threadId` is set for a reply. */
export type ExplainerAskHandler = (input: {
  readonly anchor: T3TeamExplainerAnchor;
  readonly question: string;
  readonly threadId?: string;
}) => void;

/** Same callback shape as the PR panel's `onAddToAgentSelection`. */
export type ExplainerAddToChatHandler = (input: PullRequestAgentSelectionInput) => void;

/**
 * What the host gives the player beyond the explainer itself. Media and widgets are references
 * the host resolves, so a model-written explainer never makes the client fetch a URL it chose.
 */
export interface ExplainerHost {
  /** The URL for an `attachment:<id>` media source; undefined shows a placeholder. */
  readonly resolveAttachment?: ((attachmentId: string) => string | undefined) | undefined;
  /** A thread widget artifact by id, drawn in the chat's sandboxed widget frame. */
  readonly resolveWidget?: ((artifactId: string) => HostWidget | undefined) | undefined;
  /** The thread a widget's bridge talks to. */
  readonly widgetThreadRef?: ScopedThreadRef | null | undefined;
  readonly onOpenInCode?: ((target: ExplainerOpenInCodeTarget) => void) | undefined;
}

/** Everything a block reaches through context: the host, the reader's motion setting, Ask. */
export interface ExplainerApi extends ExplainerHost {
  readonly explainer: T3TeamExplainer;
  /** The older revision the explainer was written at, when a newer head exists. */
  readonly staleSha: string | undefined;
  readonly reducedMotion: boolean;
  readonly streaming: boolean;
  /** Threads that still point at something shown. Outdated ones are listed apart. */
  readonly threads: ReadonlyArray<T3TeamExplainerAskThread>;
  readonly activeKey: string | null;
  readonly canAsk: boolean;
  readonly canAddToChat: boolean;
  /** Opens the Ask card at `at`; called again from the same opener, it closes. */
  readonly openAsk: (
    anchor: T3TeamExplainerAnchor,
    at: Element | DOMRect,
    opener?: Element | null,
  ) => void;
  readonly addToChat: (anchor: T3TeamExplainerAnchor, request?: string) => void;
}

export const ExplainerContext = createContext<ExplainerApi | null>(null);

export function useExplainer(): ExplainerApi {
  const api = useContext(ExplainerContext);
  if (!api) throw new Error("useExplainer is used outside ExplainerPlayer");
  return api;
}
