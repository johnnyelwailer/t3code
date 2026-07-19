import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import { resumeWorkflow } from "@t3work/sdk";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3work-workflowEngineLaunch.ts";
import {
  coordinateWorkflowRepair,
  parseWorkflowRepairChildResult,
} from "./t3work-workflowSelfHeal.ts";
import { validateWorkflowRepairCandidate } from "./t3work-workflowRepairGuardrails.ts";
import { workflowAdmissionQueue } from "./t3work-workflowAdmissionQueue.ts";

/** Race one hidden repair reply against its remaining shared deadline. */
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

export const remainingWorkflowRepairBudget = (deadlineMs: number, nowMs: number): number =>
  Math.max(0, deadlineMs - nowMs);

export const workflowRepairIsStopped = (
  input: Pick<LaunchWorkflowRecipeInput, "runId" | "registry">,
  controller: Pick<WorkflowRunController, "isCancelled">,
): boolean =>
  controller.isCancelled() ||
  input.registry.getRun(input.runId) === undefined ||
  workflowAdmissionQueue.isCancelled(input.runId);

/** Host-owned self-heal: child turn, candidate validation, replacement, and resume. */
export async function tryWorkflowRepair(
  input: LaunchWorkflowRecipeInput,
  controller: WorkflowRunController,
  error: unknown,
): Promise<boolean> {
  const stopped = (): boolean => workflowRepairIsStopped(input, controller);
  if (stopped()) return false;
  const maxAttempts = Math.max(0, Math.min(5, input.repairMaxAttempts ?? 3));
  if (input.repairIntent === undefined || maxAttempts === 0) return false;
  const repairModelSelection =
    input.repairModelSelection === "inherit" || input.repairModelSelection === undefined
      ? input.modelSelection
      : input.repairModelSelection;
  const priorReasons: string[] = [];
  const repairFailureReason = (error instanceof Error ? error.message : String(error))
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const deadline =
    (await Effect.runPromise(Clock.currentTimeMillis)) +
    Math.max(1_000, input.repairTotalTimeBudgetMs ?? 900_000);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (stopped()) return false;
    const timeoutMs = remainingWorkflowRepairBudget(
      deadline,
      await Effect.runPromise(Clock.currentTimeMillis),
    );
    if (timeoutMs <= 0) return false;
    const source = await input.readWorkflowSource?.().catch(() => null);
    if (source === null || source === undefined) return false;
    let repairReason: string | undefined;
    let repairChildId: string | undefined;
    const result = await coordinateWorkflowRepair({
      origin: "ephemeral",
      repairAttempts: attempt,
      maxAttempts,
      source,
      failure: error,
      intent: input.repairIntent,
      args: input.args,
      workspaceRoot: input.runsRoot,
      generateRepair: async ({ source, failure, intent, args, workspaceRoot }) => {
        if (stopped()) throw new Error("Workflow was stopped");
        const prompt = [
          "Repair this t3work workflow. Return exact JSON only.",
          'Return exact JSON only: {"safeToResume":true,"correctedWorkflow":"...","summary":"..."} or {"safeToResume":false,"cancelReason":"..."}.',
          `Intent goal: ${intent.goal}`,
          `Expected outcome: ${intent.expectedOutcome}`,
          `Guardrails (must not widen): ${intent.guardrails.join(" | ")}`,
          `Failure: ${failure}`,
          ...(priorReasons.length === 0
            ? []
            : [`Prior repair failures: ${priorReasons.join(" | ")}`]),
          `Args: ${JSON.stringify(args)}`,
          `Workspace root: ${workspaceRoot}`,
          `Source:\n${source}`,
        ].join("\n\n");
        if (input.generateRepairStructured !== undefined) {
          try {
            const generated = await input.generateRepairStructured({
              prompt,
              modelSelection: repairModelSelection,
            });
            const parsed = parseWorkflowRepairChildResult(JSON.stringify(generated));
            if (parsed?.outcome === "fixed")
              return {
                kind: "replacement" as const,
                source: parsed.updatedSource,
                summary: parsed.summary,
              };
            return {
              kind: "cannotRepair" as const,
              reason:
                parsed?.outcome === "cannot-fix"
                  ? parsed.reason
                  : "Repair generator returned invalid structured output.",
            };
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
        repairChildId = childId;
        input.registry.registerChildThread(input.runId, childId);
        const replyPromise = new Promise<string>((resolve, reject) => {
          void (async () => {
            if (stopped()) throw new Error("Workflow was stopped");
            // Wait until the create command has committed its ephemeral
            // retention before publishing a pending repair turn. This prevents
            // a fast provider reply from racing the shell's create event.
            await input.dispatch({
              type: "thread.create",
              commandId: CommandId.make(`t3work-wf:repair:create:${input.newId()}`),
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
              commandId: CommandId.make(`t3work-wf:repair:turn:${input.newId()}`),
              threadId: ThreadId.make(childId),
              message: {
                messageId: MessageId.make(input.newId()),
                role: "user",
                text: prompt,
                attachments: [],
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
        const parsed = parseWorkflowRepairChildResult(reply);
        if (parsed?.outcome === "fixed")
          return {
            kind: "replacement" as const,
            source: parsed.updatedSource,
            summary: parsed.summary,
          };
        return {
          kind: "cannotRepair" as const,
          reason:
            repairReason ??
            (parsed?.outcome === "cannot-fix"
              ? parsed.reason
              : "Repair child returned invalid JSON."),
        };
      },
      validateSource: (replacement, original) =>
        validateWorkflowRepairCandidate({
          originalSource: original,
          replacementSource: replacement,
          absolutePath: input.workflowPath,
        }),
      replaceSource: async (nextSource) => {
        if (stopped()) throw new Error("Workflow was stopped");
        if (input.replaceWorkflowSource === undefined)
          throw new Error("Workflow source replacement is unavailable.");
        await input.replaceWorkflowSource(nextSource);
      },
      resumeWorkflowAfterRepair: async () => {
        if (stopped()) return false;
        try {
          await controller.settle(
            await resumeWorkflow(input.runId, controller.ref, input.args, controller.options),
          );
          return true;
        } catch {
          return false;
        }
      },
      recordAudit: async (audit) =>
        input.recordRepairAudit?.({
          attempt: attempt + 1,
          originalError: audit.failure,
          outcome: audit.outcome,
          ...(audit.summary === undefined ? {} : { summary: audit.summary }),
          ...(audit.reason === undefined ? {} : { reason: audit.reason }),
        }),
      activity: async (phase, detail) => {
        // A successful settle unregisters the run before the coordinator publishes its final
        // recovery activity. Cancellation cannot reach this phase because resume returns false.
        if (phase !== "recovered" && stopped()) return;
        await controller.stepActivities.emitSent({
          correlationId: `${input.runId}:repair:${attempt + 1}:${phase}`,
          stepKind: "workflow.self-heal",
          phase: phase === "failed" ? "failed" : phase === "recovered" ? "completed" : "started",
          // This text is both the activity payload and the card-row label. Keep it authored by
          // the host: repair prompts, model ids, and runtime kinds must never become UI text.
          detail:
            phase === "analysing"
              ? "Analysing failure"
              : phase === "repairing"
                ? "Repairing workflow"
                : phase === "resuming"
                  ? "Resuming workflow"
                  : phase === "recovered"
                    ? "Workflow recovered"
                    : "Repair attempt failed",
          ...(phase === "failed" && detail !== undefined ? { error: detail } : {}),
          ...(phase === "analysing" && repairFailureReason.length > 0
            ? { error: repairFailureReason }
            : {}),
          ...(repairChildId === undefined ? {} : { threadId: repairChildId }),
        });
      },
    });
    if (result.kind === "recovered") return true;
    if (result.kind === "not-attempted") return false;
    priorReasons.push(result.reason.slice(0, 240));
  }
  return false;
}
