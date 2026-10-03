/**
 * Hook for the delegate_task inputs beyond upstream's core fields: the neutral
 * `workspace` isolation and the host-registered `extensions` options.
 *
 * `OrchestratorMcpService.delegateTask` calls `prepare` after it resolved the
 * child's target model and before it dispatches `delegated_task.request`; the
 * returned model selection and workspace go into that one command. Once the
 * child exists it calls `afterCreate(childThreadId)` (outside any thread lock,
 * so it may write side stores but must not wait on the child) and appends all
 * returned notes to the tool result.
 *
 * The default rejects `workspace.isolation: "worktree"` and every extension
 * key with `invalid_request`, so a host without a registered implementation
 * keeps upstream's behaviour exactly. A host registers ONE implementation by
 * providing this reference to `OrchestratorMcpService.layer` (McpHttpServer.ts).
 */
import {
  type ModelSelection,
  type OrchestrationV2AppThread,
  type OrchestratorMcpDelegateWorkspace,
  OrchestratorMcpFailure,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

import type { McpInvocationScope } from "./McpInvocationContext.ts";

export interface DelegatedTaskPreparationInput {
  readonly scope: McpInvocationScope;
  readonly parentThread: OrchestrationV2AppThread;
  /** Stable per delegate_task request (the clientRequestId when given). */
  readonly requestKey: string;
  readonly title: string | undefined;
  readonly modelSelection: ModelSelection;
  /** True when the caller passed `target.options` (explicit options beat derived ones). */
  readonly explicitTargetOptions: boolean;
  readonly workspace: OrchestratorMcpDelegateWorkspace | undefined;
  readonly extensions: Readonly<Record<string, unknown>> | undefined;
}

export interface DelegatedTaskWorkspaceOverride {
  readonly branch: string | null;
  readonly worktreePath: string | null;
}

export interface DelegatedTaskPrepared {
  readonly modelSelection: ModelSelection;
  /** Omitted: the child inherits the parent's checkout. */
  readonly workspace?: DelegatedTaskWorkspaceOverride;
  readonly notes: ReadonlyArray<string>;
  /** Runs once the child thread exists; returns extra notes. Must not fail the delegation. */
  readonly afterCreate: (childThreadId: ThreadId) => Effect.Effect<ReadonlyArray<string>>;
}

export interface DelegatedTaskExtensionOption {
  readonly key: string;
  readonly description: string;
}

export interface DelegatedTaskPreparationShape {
  readonly workspaceIsolation: boolean;
  readonly extensions: ReadonlyArray<DelegatedTaskExtensionOption>;
  readonly prepare: (
    input: DelegatedTaskPreparationInput,
  ) => Effect.Effect<DelegatedTaskPrepared, OrchestratorMcpFailure>;
}

const invalid = (message: string) => new OrchestratorMcpFailure({ code: "invalid_request", message });

/** Rejects what this host cannot honour; shared by the default and host implementations. */
export const rejectUnsupportedDelegationInput = (
  input: Pick<DelegatedTaskPreparationInput, "workspace" | "extensions">,
  supported: Pick<DelegatedTaskPreparationShape, "workspaceIsolation" | "extensions">,
): Effect.Effect<void, OrchestratorMcpFailure> => {
  if (input.workspace?.isolation === "worktree" && !supported.workspaceIsolation) {
    return Effect.fail(invalid("Workspace isolation is not available on this host."));
  }
  if (input.workspace?.isolation !== "worktree" && input.workspace !== undefined) {
    if (input.workspace.repository !== undefined || input.workspace.baseRef !== undefined) {
      return Effect.fail(invalid("workspace.repository and workspace.baseRef need isolation=worktree."));
    }
  }
  const known = new Set(supported.extensions.map((option) => option.key));
  const unknown = Object.keys(input.extensions ?? {}).filter((key) => !known.has(key));
  return unknown.length === 0
    ? Effect.void
    : Effect.fail(
        invalid(
          known.size === 0
            ? `This host accepts no delegation extensions (got ${unknown.join(", ")}).`
            : `Unknown delegation extensions ${unknown.join(", ")}; accepted: ${[...known].join(", ")}.`,
        ),
      );
};

export const defaultDelegatedTaskPreparation: DelegatedTaskPreparationShape = {
  workspaceIsolation: false,
  extensions: [],
  prepare: (input) =>
    rejectUnsupportedDelegationInput(input, defaultDelegatedTaskPreparation).pipe(
      Effect.as({
        modelSelection: input.modelSelection,
        notes: [],
        afterCreate: () => Effect.succeed([]),
      }),
    ),
};

export class DelegatedTaskPreparation extends Context.Reference<DelegatedTaskPreparationShape>(
  "t3team/mcp/DelegatedTaskPreparation",
  { defaultValue: () => defaultDelegatedTaskPreparation },
) {}
