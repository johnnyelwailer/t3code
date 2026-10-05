/**
 * The author thread's side of `t3team.orchestration.run`: from a thread that owns an author
 * session, the call IS the submission of source for that session's run. The decision — "this
 * source is launched / resumed" — is the tool argument; the verdict comes back as the tool result,
 * so a finding is something the author fixes in its next tool call, never an error the caller sees.
 *
 * Also owns the author's model choice: the calling thread's provider instance at its catalog-
 * declared default, or the thread's own model when that instance declares none (#346's resolver).
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import type { RunWorkflowToolResult } from "@t3team/sdk";
import * as Effect from "effect/Effect";

import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";
import type { WorkflowAuthorSession } from "./t3team-workflowAuthorSession.ts";
import { formatWorkflowSourceFindings } from "./t3team-workflowSourceCheck.ts";

export function submitAuthoredWorkflowSource(
  session: WorkflowAuthorSession,
  args: { readonly source?: string | undefined },
): Effect.Effect<RunWorkflowToolResult, string> {
  const source = args.source?.trim() ?? "";
  if (source.length === 0) {
    return Effect.fail(
      "As this run's author, pass the orchestration `source` you validated; the run id and intent are already bound.",
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
          } satisfies RunWorkflowToolResult)
        : Effect.fail(
            `The source was not accepted. Fix every finding, then submit again:\n${formatWorkflowSourceFindings(result.findings)}`,
          ),
    ),
  );
}

/**
 * Drivers that honor the author's `plan` interaction mode by removing native edit/shell tools
 * (`t3team-workflowAuthorTurn.ts`). Grok and Antigravity read only `runtimeMode`, so an author
 * there would keep the caller's full toolset — the caller's instance is used only when it can be
 * restricted; otherwise the first restrictable instance in the live catalog takes over.
 */
export const PLAN_RESTRICTED_DRIVERS: ReadonlySet<string> = new Set([
  "claudeAgent",
  "codex",
  "cursor",
  "opencode",
]);

/**
 * The author's model: the caller's instance at its declared default (#346 resolver), else the
 * caller's model — unless that instance's driver cannot be restricted, in which case the first
 * restrictable instance at its declared default. No restrictable instance at all falls back to the
 * caller's (reported by the admit step's detail), never to no author.
 */
export function resolveWorkflowAuthorModel(
  callerModelSelection: ModelSelection,
  providers: ReadonlyArray<ServerProvider> | undefined,
): ModelSelection {
  if (providers === undefined) return callerModelSelection;
  const callerInstance = providers.find(
    (provider) =>
      provider.instanceId.toLowerCase() === callerModelSelection.instanceId.toLowerCase(),
  );
  const candidates =
    callerInstance === undefined || PLAN_RESTRICTED_DRIVERS.has(String(callerInstance.driver))
      ? [undefined]
      : [
          ...providers
            .filter((provider) => PLAN_RESTRICTED_DRIVERS.has(String(provider.driver)))
            .map((provider) => String(provider.instanceId)),
          undefined,
        ];
  for (const requestedProvider of candidates) {
    const result = resolveStartChildModelSelection({
      parentModelSelection: callerModelSelection,
      ...(requestedProvider === undefined ? {} : { requestedProvider }),
      providers,
    });
    if (result.ok) return result.value;
  }
  // The caller's own instance being unresolvable is a configuration problem the run itself will
  // surface; the author then simply inherits the caller's model rather than failing to exist.
  return callerModelSelection;
}
