/**
 * Producing one candidate replacement for a failing agent-authored workflow.
 *
 * Split from `t3team-workflowEngineRepair.ts`, which owns the bounded attempt loop (budget,
 * ceilings, audit, resume). This is the part that asks a model for a fix, and it has two paths that
 * must not be confused: structured generation, which is what production wires and which exposes NO
 * shell, file, or browser tools to the repair model; and a compatibility fallback driving a real
 * child thread. `allowRepairThreadFallback === false` is what keeps that fallback off in production.
 *
 * The child id is reported through `onRepairChildId` rather than returned: the caller reads it much
 * later, on the audit path, and only the fallback branch ever sets it.
 */
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import {
  buildWorkflowArgsRepairPrompt,
  buildWorkflowRepairPrompt,
} from "./t3team-workflowRepairPrompt.ts";
import {
  parseWorkflowArgsRepairChildResult,
  parseWorkflowRepairChildResult,
  type GenerateWorkflowRepair,
  type WorkflowRepairTarget,
} from "./t3team-workflowSelfHeal.ts";

/**
 * Lives here rather than in the attempt loop: this module is its only caller, and importing it
 * back from `t3team-workflowEngineRepair.ts` would make the two modules cyclic.
 */
export const awaitWorkflowRepairChildReply = (input: {
  readonly reply: Promise<string>;
  readonly timeoutMs: number;
  readonly onTimeout: () => void;
}): Promise<string> =>
  Promise.race([
    input.reply,
    Effect.runPromise(Effect.sleep(input.timeoutMs)).then(() => {
      input.onTimeout();
      throw new Error(`Repair child timed out after ${input.timeoutMs}ms.`);
    }),
  ]);

export type WorkflowRepairGenerateContext = {
  readonly input: LaunchWorkflowRecipeInput;
  readonly stopped: () => boolean;
  readonly priorReasons: ReadonlyArray<string>;
  readonly repairModelSelection: LaunchWorkflowRecipeInput["modelSelection"];
  readonly attempt: number;
  readonly timeoutMs: number;
  readonly onRepairChildId: (childId: string) => void;
};

/** Parse a raw reply against the protocol for `target`, and shape it into the
 * `GenerateWorkflowRepair` result. `fallbackReason` covers both "no parseable JSON" and
 * (for the child-thread path) a pre-parse failure the caller already knows about — see the
 * two call sites below. */
function toRepairOutcome(
  target: WorkflowRepairTarget,
  reply: string,
  fallbackReason: string,
): Awaited<ReturnType<GenerateWorkflowRepair>> {
  if (target === "args") {
    const parsed = parseWorkflowArgsRepairChildResult(reply);
    if (parsed?.outcome === "fixed")
      return { kind: "argsReplacement", args: parsed.updatedArgs, summary: parsed.summary };
    return {
      kind: "cannotRepair",
      reason: parsed?.outcome === "cannot-fix" ? parsed.reason : fallbackReason,
    };
  }
  const parsed = parseWorkflowRepairChildResult(reply);
  if (parsed?.outcome === "fixed")
    return { kind: "sourceReplacement", source: parsed.updatedSource, summary: parsed.summary };
  return {
    kind: "cannotRepair",
    reason: parsed?.outcome === "cannot-fix" ? parsed.reason : fallbackReason,
  };
}

export function makeWorkflowRepairGenerator(ctx: WorkflowRepairGenerateContext) {
  const { input, stopped, priorReasons, repairModelSelection, attempt, timeoutMs } = ctx;
  return async ({
    source,
    failure,
    intent,
    args,
    workspaceRoot,
    target,
  }: Parameters<GenerateWorkflowRepair>[0]) => {
    // Local to one attempt: the original declared it in the loop scope but never read it outside.
    let repairReason: string | undefined;
    if (stopped()) throw new Error("Workflow was stopped");
    // An input-contract fault gets its own prompt + response protocol: corrected ARGS, never a
    // source rewrite (see WorkflowRepairTarget in t3team-workflowRepairGuardrails.ts).
    const prompt = (target === "args" ? buildWorkflowArgsRepairPrompt : buildWorkflowRepairPrompt)({
      intent,
      failure,
      priorReasons,
      args,
      workspaceRoot,
      source,
    });
    if (input.generateRepairStructured !== undefined) {
      try {
        const generated = await input.generateRepairStructured({
          prompt,
          modelSelection: repairModelSelection,
        });
        return toRepairOutcome(
          target,
          JSON.stringify(generated),
          "Repair generator returned invalid structured output.",
        );
      } catch (cause) {
        return {
          kind: "cannotRepair" as const,
          reason: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }

    if (input.allowRepairThreadFallback === false)
      return {
        kind: "cannotRepair" as const,
        reason: "Structured repair generation is unavailable.",
      };

    // Compatibility fallback. Production wiring uses structured generation above, which
    // exposes no shell, file, browser, or other tools to the repair model.
    const childId = `${input.runId}:repair:${attempt + 1}`;
    ctx.onRepairChildId(childId);
    input.registry.registerChildThread(input.runId, childId);
    const replyPromise = new Promise<string>((resolve, reject) => {
      void (async () => {
        if (stopped()) throw new Error("Workflow was stopped");
        // Wait until the create command has committed its ephemeral
        // retention before publishing a pending repair turn. This prevents
        // a fast provider reply from racing the shell's create event.
        await input.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`t3team-wf:repair:create:${input.newId()}`),
          threadId: ThreadId.make(childId),
          projectId: input.projectId,
          title: "Workflow repair",
          modelSelection: repairModelSelection,
          runtimeMode: input.runtimeMode,
          interactionMode: input.interactionMode,
          branch: null,
          worktreePath: null,
          createdAt: input.nowIso(),
          retention: "ephemeral",
        });
        if (stopped()) throw new Error("Workflow was stopped");
        input.registry.setPending(childId, {
          runId: input.runId,
          correlationId: `${input.runId}:repair:${attempt + 1}`,
          kind: "thread.turn",
          resolveLive: async (value) => {
            resolve(typeof value === "string" ? value : JSON.stringify(value));
          },
          cancelLive: () => reject(new Error("Workflow was stopped")),
        });
        await input.dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make(`t3team-wf:repair:turn:${input.newId()}`),
          threadId: ThreadId.make(childId),
          message: {
            messageId: MessageId.make(input.newId()),
            role: "user",
            text: prompt,
            attachments: [],
            // Marks this as an automated start for decider turn admission.
            t3teamExt: { author: { kind: "system" } },
          },
          modelSelection: repairModelSelection,
          runtimeMode: input.runtimeMode,
          interactionMode: input.interactionMode,
          createdAt: input.nowIso(),
        });
      })().catch(reject);
    });
    const reply = await awaitWorkflowRepairChildReply({
      reply: replyPromise,
      timeoutMs,
      onTimeout: () => {
        input.registry.takePending(childId);
      },
    }).catch((cause: unknown) => {
      repairReason = cause instanceof Error ? cause.message : String(cause);
      return "";
    });
    return toRepairOutcome(target, reply, repairReason ?? "Repair child returned invalid JSON.");
  };
}
