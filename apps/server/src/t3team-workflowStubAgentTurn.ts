/**
 * A scripted agent for workflow tests and the recipe E2E harness: a provider whose every turn is
 * answered by a caller-supplied `reply` — through the REAL orchestration V2 provider seam.
 *
 * Fidelity is the whole point: the workflow reactor resolves an `askAgent` from the run's own
 * records, so the stub drives the same path a real adapter does — it is a pack provider
 * (`@t3team/pack-api`, bridged by the host's pack adapter) that emits V2 adapter events: the
 * provider turn running, the assistant message(s), the provider turn completed, and the terminal.
 *
 * A reply is the text of the turn's final answer; an array is several assistant messages (a
 * preamble, then the answer); `{ fail }` / `{ interrupted }` end the turn without completing it
 * (after an optional streamed preamble); `{ silent }` completes the turn without a word;
 * `{ hold }` starts the turn and never ends it.
 */
import type { PackJson, PackTurnInput } from "@t3team/pack-api";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ProviderAdapterRegistry from "./orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderContinuationRequests from "./orchestration-v2/ProviderContinuationRequests.ts";
import {
  completedTurnEvents,
  makeScriptedPack,
  NOW,
  PACK_DRIVER,
} from "./t3team-pack-driver.fixtures.ts";
import { makePackOrchestrationAdapter } from "./t3team-pack-driverAdapter.ts";

export type WorkflowStubReply =
  | string
  | ReadonlyArray<string>
  /** The turn streams `preamble` (if any), then FAILS with this reason. */
  | { readonly fail: string; readonly preamble?: ReadonlyArray<string> }
  /** The turn streams `preamble` (if any), then is interrupted before it completes. */
  | { readonly interrupted: true; readonly preamble?: ReadonlyArray<string> }
  | { readonly silent: true }
  | { readonly hold: true };

/** The stub's provider instance; threads the stub answers use this model selection. */
export const WORKFLOW_STUB_MODEL_SELECTION = {
  instanceId: ProviderInstanceId.make(PACK_DRIVER),
  model: "example/model",
};

const assistantEvents = (turn: PackTurnInput, texts: ReadonlyArray<string>): PackJson[] =>
  texts.flatMap((text, index) => {
    const messageId = `message:${turn.attemptId}:assistant:${index}`;
    const base = { threadId: turn.threadId, runId: turn.runId, nodeId: turn.rootNodeId };
    return [
      {
        type: "message.updated",
        driver: PACK_DRIVER,
        message: {
          ...base,
          id: messageId,
          role: "assistant",
          text,
          attachments: [],
          streaming: false,
          createdAt: NOW,
          updatedAt: NOW,
          createdBy: "agent",
          creationSource: "provider",
        },
      },
      {
        type: "turn_item.updated",
        driver: PACK_DRIVER,
        turnItem: {
          ...base,
          id: `turn-item:${messageId}`,
          type: "assistant_message",
          messageId,
          text,
          streaming: false,
          providerThreadId: String(turn.providerThread.id),
          providerTurnId: `provider-turn:${turn.attemptId}`,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: index + 1,
          status: "completed",
          title: null,
          startedAt: NOW,
          completedAt: NOW,
          updatedAt: NOW,
        },
      },
    ];
  });

/** The adapter events one scripted turn emits, in the order a real adapter emits them. */
function stubAgentTurnEvents(turn: PackTurnInput, reply: WorkflowStubReply): PackJson[] {
  const [running, completed, terminal] = completedTurnEvents(turn) as [
    PackJson,
    PackJson,
    PackJson,
  ];
  if (typeof reply === "string")
    return [running, ...assistantEvents(turn, [reply]), completed, terminal];
  if ("hold" in reply) return [running];
  if ("silent" in reply) return [running, completed, terminal];
  if ("fail" in reply || "interrupted" in reply) {
    const end =
      "fail" in reply
        ? {
            status: "failed",
            failureItemOrdinal: (reply.preamble?.length ?? 0) + 1,
            failure: { class: "provider_error", message: reply.fail, code: null, retryable: true },
          }
        : { status: "interrupted" };
    return [running, ...assistantEvents(turn, reply.preamble ?? []), { ...terminal, ...end }];
  }
  return [running, ...assistantEvents(turn, reply), completed, terminal];
}

/**
 * A provider registry whose one instance answers every turn with `respond(turn)`. `turns`
 * records each turn's input (prompt text, thread, run) in order, for assertions.
 */
export function makeWorkflowStubProvider(
  respond: (turn: PackTurnInput, index: number) => WorkflowStubReply,
) {
  const pack = makeScriptedPack({
    autoComplete: false,
    session: {
      startTurn: async (turn: PackTurnInput) => {
        const index = pack.turns.length;
        pack.turns.push(turn);
        for (const event of stubAgentTurnEvents(turn, respond(turn, index))) {
          pack.events.push(event);
        }
      },
    },
  });
  const registryLayer = ProviderAdapterRegistry.layerFromAdaptersEffect(
    Effect.gen(function* () {
      const requests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
      return [
        makePackOrchestrationAdapter({
          adapter: pack.instance.orchestration,
          driver: ProviderDriverKind.make(PACK_DRIVER),
          instanceId: WORKFLOW_STUB_MODEL_SELECTION.instanceId,
          offerContinuation: requests.offer,
        }),
      ];
    }),
  );
  return {
    registryLayer,
    turns: pack.turns,
    /** End a turn that was answered `{ hold: true }` with `reply` (its running event already went). */
    settle: (turn: PackTurnInput, reply: Exclude<WorkflowStubReply, { readonly hold: true }>) => {
      for (const event of stubAgentTurnEvents(turn, reply).slice(1)) pack.events.push(event);
    },
  };
}
