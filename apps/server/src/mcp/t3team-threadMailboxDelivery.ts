/**
 * Hook for `t3_thread_send` with `mode: "mailbox"`: a host-registered,
 * coalescing delivery that never steers. Instead of starting, queueing or
 * steering a run per message, the message is recorded durably for the target
 * thread and delivered together with other pending messages as ONE digest run
 * once the target is idle (urgency, hop cap and user-stop holds are the
 * host's policy).
 *
 * `OrchestratorMcpService.sendToThread` calls `send` after its usual scope and
 * privilege checks, with the stable message id it derived from the request
 * key (so a retried call is idempotent). The default has no implementation and
 * the tool answers `invalid_request`; a host registers ONE implementation by
 * providing this reference to `McpHttpServer.layer` (server.ts).
 */
import type { MessageId, OrchestratorMcpFailure, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface ThreadMailboxSendInput {
  readonly senderThreadId: ThreadId;
  readonly targetThreadId: ThreadId;
  readonly messageId: MessageId;
  readonly text: string;
  readonly summary: string | undefined;
  readonly urgent: boolean;
}

export interface ThreadMailboxSendResult {
  /** `queued`: waits for the digest; `surfaced`: shown without a reaction (loop guard). */
  readonly state: "queued" | "surfaced";
  readonly note?: string;
}

export interface ThreadMailboxDeliveryShape {
  readonly send:
    | ((
        input: ThreadMailboxSendInput,
      ) => Effect.Effect<ThreadMailboxSendResult, OrchestratorMcpFailure>)
    | null;
}

export class ThreadMailboxDelivery extends Context.Reference<ThreadMailboxDeliveryShape>(
  "t3team/ThreadMailboxDelivery",
  { defaultValue: () => ({ send: null }) },
) {}
