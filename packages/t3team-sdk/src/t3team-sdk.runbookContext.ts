/**
 * Assembles the neutral `RunbookContext` (`@runbook/core/authoring`) subset that a runbook
 * body's `run(ctx)` receives. Built from the same primitives `buildWorkflowGlobals` already
 * wires for the top-level `tools.*` tree and the journaled runtime clock/entropy — this is not
 * a new capability, just a second, `ctx`-shaped view onto them.
 *
 * Only members this host can honestly implement today are provided: `tool`, `now`, `uuid`,
 * `random`. The rest of `RunbookContext` (`ask`, `sleep`, `waitUntil`, `prompt`,
 * `promptsUsed`, `runInfo`) has no backing primitive in this engine yet and is intentionally
 * left unset rather than stubbed to throw.
 *
 * Split out of `t3team-sdk.bodyRunner.ts` to keep that file under the additive-guard LOC cap.
 */

import { TargetMissingError } from "./t3team-sdk.errors.ts";
import { assertToolGroupDeclared } from "./t3team-sdk.capabilityGating.ts";
import type * as T from "./t3team-sdk.types.ts";
import type { RunbookContext } from "@runbook/core/authoring";

/** Build the honest `RunbookContext` subset for one body run. */
export function buildRunbookContext(opts: {
  readonly toolRefs: ReadonlyArray<T.AnyToolRef>;
  readonly runtime: T.WorkflowRuntime;
  readonly capabilities: ReadonlySet<string>;
}): Pick<RunbookContext, "tool" | "now" | "uuid" | "random"> {
  const toolsById = new Map(opts.toolRefs.map((ref) => [ref.id, ref]));
  return {
    tool: async <R = unknown>(name: string, args?: Record<string, unknown>): Promise<R> => {
      const ref = toolsById.get(name);
      if (ref === undefined) {
        throw new TargetMissingError(`ctx.tool: unknown tool '${name}'`);
      }
      // Same call-site capability gate `buildToolTree` applies to the `tools.*` tree.
      assertToolGroupDeclared(ref, opts.capabilities);
      return (await opts.runtime.callTool(ref as T.ToolRef<unknown, unknown>, args)) as R;
    },
    // `Reflect.construct` (not `new Date(...)`) sidesteps the effect(globalDate) lint rule the
    // same way `makeJournaledDate` in `@runbook/ts/globals` does — this IS the journaled clock.
    now: () => Reflect.construct(Date, [opts.runtime.now()]) as Date,
    uuid: () => opts.runtime.uuid(),
    random: () => opts.runtime.random(),
  };
}
