/**
 * The callable surfaces bound into a run: the `tools.*` / `scripts.*` trees, plus the broker stand-in
 * that explains itself when a run was started without one.
 *
 * Extracted from `t3team-sdk.bodyRunner.ts` (which reached the 200-line cap when the imported engine
 * API landed): building a tree from refs is a separate concern from running a body against a runtime,
 * and the call-site capability gate lives with the tree it guards.
 */

import { assertToolGroupDeclared } from "./t3team-sdk.capabilityGating.ts";
import { WorkflowError } from "./t3team-sdk.errors.ts";
import { setNestedValue } from "./t3team-sdk.internal.ts";
import type { MessageBroker } from "./t3team-sdk.broker.ts";
import type * as T from "./t3team-sdk.types.ts";

/**
 * Thread verbs need a broker to reach the host. Failing at the CALL with a sentence naming the
 * missing option beats a run that starts fine and then dies on an undefined member.
 */
export const defaultBroker: MessageBroker = {
  send: () => {
    throw new WorkflowError(
      "This workflow fired a thread verb (spawnThread/agent/thread.askAgent/askUser/notify) but the run was started without a `broker`. Provide one via the run options.",
    );
  },
};

export function buildToolTree(
  refs: ReadonlyArray<T.AnyToolRef>,
  runtime: T.WorkflowRuntime,
  declaredCapabilities: ReadonlySet<string>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const ref of refs) {
    // The spec's call-site gate (§Tools): the ref's group is checked against
    // meta.capabilities when the body CALLS the tool, mirroring the "user"/"script" gates.
    setNestedValue(root, ref.id, (args: unknown) => {
      assertToolGroupDeclared(ref, declaredCapabilities);
      return runtime.callTool(ref as T.ToolRef<unknown, unknown>, args);
    });
  }
  return root;
}

export function buildScriptTree(
  scripts: Readonly<Record<string, T.AnyScriptRef>>,
  runtime: T.WorkflowRuntime,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [name, ref] of Object.entries(scripts)) {
    root[name] = (args: unknown) => runtime.callScript(ref as T.ScriptRef<unknown, unknown>, args);
  }
  return root;
}
