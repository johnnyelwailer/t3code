/** T3Team adapter for the reusable thread broker port and local filesystem default. */

import { appendResolvedEntry as appendGenericResolvedEntry } from "@runbook/threads/broker";
import {
  createHostBroker,
  createInterceptingBroker,
  createMockBroker,
} from "@runbook/threads/broker";
import type { InterceptHandlers, MessageBroker } from "@runbook/threads/broker";
import { defaultRunsRoot } from "./t3team-sdk.journalStore.ts";

export { createHostBroker, createInterceptingBroker, createMockBroker };
export type {
  HandleKind,
  HostBrokerHandlers,
  InterceptHandler,
  InterceptHandlers,
  MessageBroker,
  MessageEnvelope,
  MockBroker,
  MockBrokerOutcome,
} from "@runbook/threads/broker";

export type AppendResolvedEntryOptions = Parameters<typeof appendGenericResolvedEntry>[0];

export async function appendResolvedEntry(opts: AppendResolvedEntryOptions): Promise<boolean> {
  return appendGenericResolvedEntry({
    ...opts,
    ...(opts.store !== undefined || opts.runsRoot !== undefined
      ? {}
      : { runsRoot: defaultRunsRoot() }),
  });
}

/**
 * `workflow()`'s third parameter (Epic: sub-workflow effect interception): the caller declares,
 * per `HandleKind`, a handler that answers a child sub-workflow's effect in place of the real
 * host. Unlisted kinds are untouched — {@link childBrokerFor} falls through to the parent broker
 * verbatim — so an existing two-argument `workflow(ref, args)` call keeps compiling and behaving
 * identically.
 */
export interface WorkflowInvokeOpts {
  readonly handlers?: InterceptHandlers;
}

/**
 * The broker a sub-workflow invocation hands its child: `parent` unchanged when `opts` declares
 * no handlers, otherwise {@link createInterceptingBroker} composed over it. Kept here (rather
 * than inlined at the call site in `t3team-sdk.subWorkflows.ts`) so the composition — and the
 * "additive, no special-casing in dispatch" contract behind it — has one obvious home next to the
 * broker types it builds on.
 */
export function childBrokerFor(
  parent: MessageBroker,
  opts: WorkflowInvokeOpts | undefined,
): MessageBroker {
  return opts?.handlers === undefined ? parent : createInterceptingBroker(parent, opts.handlers);
}
