/**
 * Repairing a failed run through the SAME author conversation that wrote it.
 *
 * The incident this replaces: a context-free repair model, given only the base manual and the
 * error, answered "cannot fix" three times in five seconds. The author thread has the intent, the
 * catalog it read, its own validation history and the source it chose — so the failure goes back
 * there as a new turn, and the fix arrives the same way the original did: as a submission through
 * the author's `t3team.orchestration.run` tool, gated by the full check. The repair coordinator
 * (`t3team-workflowSelfHeal.ts`) then validates the candidate against its guardrails, replaces the
 * source and resumes, exactly as for any other generator.
 *
 * "Cannot fix" — the author ending its turn without submitting — is TERMINAL: the author with full
 * context declined, and asking again blind is what produced the incident.
 */
import type { GenerateWorkflowRepair } from "./t3team-workflowSelfHeal.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import { buildWorkflowAuthorRepairTurn } from "./t3team-workflowAuthorPrompt.ts";
import type { WorkflowAuthorSession } from "./t3team-workflowAuthorSession.ts";
import { checkWorkflowSource } from "./t3team-workflowSourceCheck.ts";
import { driveWorkflowAuthorTurn, WorkflowAuthorTurnStopped } from "./t3team-workflowAuthorTurn.ts";

type RepairOutcome = Awaited<ReturnType<GenerateWorkflowRepair>>;

export async function generateWorkflowRepairViaAuthor(ctx: {
  readonly session: WorkflowAuthorSession;
  readonly input: Pick<
    LaunchWorkflowRecipeInput,
    | "runId"
    | "projectId"
    | "runtimeMode"
    | "interactionMode"
    | "modelSelection"
    | "registry"
    | "dispatch"
    | "newId"
    | "nowIso"
  >;
  readonly source: string;
  readonly failure: string;
  readonly priorReasons: ReadonlyArray<string>;
  readonly timeoutMs: number;
  readonly stopped: () => boolean;
}): Promise<RepairOutcome> {
  const { session, input } = ctx;
  if (session.declined) {
    return {
      kind: "cannotRepair",
      reason: "The orchestration's author already determined this failure cannot be fixed.",
      terminal: true,
    };
  }
  let submitted: string | undefined;
  session.submit = async (candidate) => {
    const verdict = checkWorkflowSource({
      source: candidate,
      baseModelSelection: input.modelSelection,
    });
    if (!verdict.ok) return verdict;
    submitted = candidate;
    session.submit = undefined;
    return { ok: true, runId: session.runId };
  };
  const reply = await driveWorkflowAuthorTurn(
    { ...input, contextStore: undefined },
    {
      runId: input.runId,
      projectId: input.projectId,
      authorModelSelection: session.authorModelSelection,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      authorThreadId: session.authorThreadId,
      correlationId: `${input.runId}:author:repair:${input.newId()}`,
      text: buildWorkflowAuthorRepairTurn({
        failure: ctx.failure,
        source: ctx.source,
        priorReasons: ctx.priorReasons,
      }),
      timeoutMs: ctx.timeoutMs,
    },
  ).then(
    (text) => ({ kind: "ended" as const, text }),
    (error: unknown) => ({ kind: "failed" as const, error }),
  );
  session.submit = undefined;
  if (submitted !== undefined) {
    return { kind: "replacement", source: submitted, summary: "Corrected by the run's author." };
  }
  if (reply.kind === "failed") {
    if (reply.error instanceof WorkflowAuthorTurnStopped || ctx.stopped()) {
      throw new Error("Workflow was stopped");
    }
    // A timeout / dispatch failure is transient: the loop may try again within its budget.
    return {
      kind: "cannotRepair",
      reason: reply.error instanceof Error ? reply.error.message : String(reply.error),
    };
  }
  session.declined = true;
  return {
    kind: "cannotRepair",
    reason:
      reply.text.trim().length > 0
        ? reply.text.trim().slice(0, 240)
        : "The orchestration's author ended its turn without a corrected source.",
    terminal: true,
  };
}
