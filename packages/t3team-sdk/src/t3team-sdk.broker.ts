/** T3Team adapter for the reusable thread broker port and local filesystem default. */

import { appendResolvedEntry as appendGenericResolvedEntry } from "@runbook/threads/broker";
import { createHostBroker, createMockBroker } from "@runbook/threads/broker";
import { defaultRunsRoot } from "./t3team-sdk.journalStore.ts";

export { createHostBroker, createMockBroker };
export type {
  HandleKind,
  HostBrokerHandlers,
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
