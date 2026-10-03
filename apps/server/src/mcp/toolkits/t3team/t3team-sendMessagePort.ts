/**
 * Port behind the `t3team_send_message` MCP tool: delivers an inter-agent
 * message from the calling thread to another thread of the same project. The
 * inter-agent messaging layer (mailbox, digest, urgency) provides the override
 * once in server.ts; the default reports that messaging is unavailable.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export interface T3TeamSendMessageInput {
  readonly toThreadId: string;
  readonly fromThreadId: ThreadId;
  readonly text: string;
  /** Short subject; long bodies are delivered as this summary plus a read pointer. */
  readonly summary?: string;
  readonly urgent?: boolean;
}

export interface T3TeamSendMessagePortShape {
  readonly send: (input: T3TeamSendMessageInput) => Effect.Effect<unknown, string>;
}

export class T3TeamSendMessagePort extends Context.Reference<T3TeamSendMessagePortShape>(
  "t3team/T3TeamSendMessagePort",
  {
    defaultValue: () => ({
      send: () => Effect.fail("Inter-agent messaging is not available in this runtime."),
    }),
  },
) {}
