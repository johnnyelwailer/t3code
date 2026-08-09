/**
 * What every broker verb handler is given.
 *
 * Split into two halves on purpose. The BROKER half is built once per run and is what serialises
 * dispatches and emits step pips; the SEND half is per envelope. Handlers take both rather than
 * closing over them, so each verb can live in its own module without the broker having to hand out
 * its internals implicitly.
 */
import { T3TeamMessageExternalResourceRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { MessageBroker } from "@t3team/sdk";

import {
  buildT3TeamWidgetAttachment,
  parseT3TeamWidgetShowInput,
} from "./t3team-widgetShowCore.ts";

import type { WorkflowEngineBrokerDeps } from "./t3team-workflowEngineBrokerTypes.ts";
import type { createWorkflowLiveSettlement } from "./t3team-workflowLiveSettlement.ts";

export type ReplyResolver = Parameters<MessageBroker["send"]>[1];

export type BrokerCore = {
  readonly deps: WorkflowEngineBrokerDeps;
  /** Serialises dispatches so a floated `thread.create` lands before the `thread.turn` it precedes. */
  readonly enqueue: (fn: () => Promise<void>) => Promise<void>;
  /** Ask verbs are awaited so failures fail the run; one-way verbs swallow theirs. */
  readonly enqueueOneWay: (fn: () => Promise<void>) => Promise<void>;
  readonly runPrimitive: (
    fn: () => Promise<void>,
    beforeDispatch?: () => Promise<void>,
  ) => Promise<void>;
  readonly step: (
    correlationId: string,
    kind: string,
    phase: "started" | "waiting" | "completed",
    detail?: string,
    threadId?: string,
  ) => void;
};

export type BrokerSend = {
  readonly correlationId: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly resolver: ReplyResolver;
  /** Blackbox composition asks settle live rather than through the journal. */
  readonly isLiveCompositionAsk: boolean;
  readonly makeLiveSettlement: () => ReturnType<typeof createWorkflowLiveSettlement>;
};

/** Attachment refs from the workflow are opaque payload (SDK black-box rule); only refs that
 * satisfy the message contract render as resource cards — anything else is dropped, never fatal. */
export const isMessageResourceRef = Schema.is(T3TeamMessageExternalResourceRef);
export const TRUSTED_HTML_FRAGMENT = /<\/?[a-z][^>]*>/i;

export function workflowWidgetAttachment(input: {
  readonly widgetId: string;
  readonly title: string;
  readonly widgetCode: string;
  readonly format?: "html" | "svg";
  readonly loadingMessages?: ReadonlyArray<string>;
}) {
  const parsed = parseT3TeamWidgetShowInput({
    title: input.title,
    widget_code: input.widgetCode,
    ...(input.format === undefined ? {} : { format: input.format }),
    ...(input.loadingMessages === undefined ? {} : { loading_messages: input.loadingMessages }),
  });
  if ("error" in parsed) throw new Error(`Invalid workflow widget: ${parsed.error}`);
  return buildT3TeamWidgetAttachment({
    widgetId: input.widgetId,
    parsed,
    artifactRelativePath: undefined,
  });
}
