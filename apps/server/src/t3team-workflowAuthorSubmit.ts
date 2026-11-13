/**
 * The author thread's side of `t3team.orchestration.run`: from a thread that owns an author
 * session, the call IS the submission of source for that session's run. The decision — "this
 * source is launched / resumed" — is the tool argument; the verdict comes back as the tool result,
 * so a finding is something the author fixes in its next tool call, never an error the caller sees.
 *
 * The author's model is chosen in `t3team-workflowAuthorModel.ts` before this submission exists.
 */
import type { RunWorkflowToolResult } from "@t3team/sdk";
import * as Effect from "effect/Effect";

import type { WorkflowAuthorSession } from "./t3team-workflowAuthorSession.ts";
import { formatWorkflowSourceFindings } from "./t3team-workflowSourceCheck.ts";

export function submitAuthoredWorkflowSource(
  session: WorkflowAuthorSession,
  args: { readonly source?: string | undefined },
): Effect.Effect<RunWorkflowToolResult, string> {
  const source = args.source?.trim() ?? "";
  if (source.length === 0) {
    return Effect.fail(
      "As this run's author, call t3_orchestration_run({ source }) with the source you validated; the run id and intent are already bound.",
    );
  }
  const submit = session.submit;
  if (submit === undefined) {
    return Effect.fail(
      `Run '${session.runId}' is not waiting for source right now (it was already launched or has ended).`,
    );
  }
  return Effect.promise(() => submit(source)).pipe(
    Effect.flatMap((result) =>
      result.ok
        ? Effect.succeed({
            ok: true as const,
            runId: result.runId,
            status: "accepted" as const,
            handoff: "workflow-ui" as const,
            hint: "Launched as this run. End your turn now with one short line.",
          } satisfies RunWorkflowToolResult)
        : Effect.fail(
            `The source was not accepted. Fix every finding, then submit again:\n${formatWorkflowSourceFindings(result.findings)}`,
          ),
    ),
  );
}
