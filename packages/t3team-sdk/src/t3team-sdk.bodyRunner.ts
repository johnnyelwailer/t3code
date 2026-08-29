/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Load a `.workflow.ts`, build the body globals (tools/scripts trees + the 25.3 primitive
 * set), run it against a runtime, and decode its result. Shared by the top-level run and by
 * `workflow()` sub-workflow invocation — the only difference is the primitive set: a
 * sub-workflow gets a set whose `workflow()` throws (one level of nesting only).
 *
 * Split out of `t3team-sdk.workflowRunner.ts` to keep that file under the additive-guard
 * LOC ceiling.
 */

import * as NodeModule from "node:module";

import * as Schema from "effect/Schema";

import type { MessageBroker } from "./t3team-sdk.broker.ts";
import {
  assertChildCapabilitiesSubset,
  assertToolGroupDeclared,
  normalizeCapabilities,
} from "./t3team-sdk.capabilityGating.ts";
import { WorkflowInputDecodeError } from "./t3team-sdk.errors.ts";
import type { HandleDispatch } from "./t3team-sdk.handles.ts";
import { decodeWithSchema, setNestedValue } from "./t3team-sdk.internal.ts";
import type { WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import { createSchedulePrimitives } from "./t3team-sdk.schedulePrimitive.ts";
import { createThreadPrimitives } from "./t3team-sdk.threadPrimitives.ts";
import {
  extractMeta,
  prepareWorkflow,
  runWorkflowBody,
  type WorkflowMeta,
  type WorkflowSource,
} from "./t3team-sdk.loader.ts";
import { withWorkflowRuntime } from "./t3team-sdk.ts";
import type * as T from "./t3team-sdk.types.ts";
import { buildScriptTree, buildToolTree, defaultBroker } from "./t3team-sdk.bodyTrees.ts";
import { withBodyApi } from "./t3team-sdk.engineApi.ts";
import { buildWorkflowGlobals } from "./t3team-sdk.workflowGlobals.ts";
import { buildRunbookContext } from "./t3team-sdk.runbookContext.ts";

const nodeRequire = NodeModule.createRequire(import.meta.url);
const fs = nodeRequire("node:fs") as { readonly readFileSync: (p: string, e: "utf8") => string };

/** Load + run a workflow body against `runtime`, decoding inputs/outputs against its `meta`. */
export async function runPreparedBody(opts: {
  readonly runtime: T.WorkflowRuntime;
  readonly ref: T.WorkflowRef;
  readonly args: unknown;
  readonly toolRefs: ReadonlyArray<T.AnyToolRef>;
  readonly scripts: Readonly<Record<string, T.AnyScriptRef>>;
  readonly primitives: WorkflowPrimitives;
  readonly handleDispatch: HandleDispatch;
  readonly broker?: MessageBroker;
  readonly launchThreadId?: string;
  readonly defaultModel?: T.ModelSelection;
  /** Present for a sub-workflow run: the parent's normalized capability set. The child's
   * declaration must be a subset — never a superset (Epic 25 §Capability gating). */
  readonly parentCapabilities?: ReadonlySet<string>;
  /** Reports this body's normalized capability set once meta is extracted (used by the
   * runner to gate `workflow()` children against THIS body's capabilities). */
  readonly onCapabilities?: (capabilities: ReadonlySet<string>) => void;
}): Promise<unknown> {
  const source: WorkflowSource = {
    absolutePath: opts.ref.absolutePath,
    sourceText: fs.readFileSync(opts.ref.absolutePath, "utf8"),
  };
  const prepared = prepareWorkflow(source);
  const meta: WorkflowMeta = extractMeta(prepared, source, Schema);
  const decodedArgs =
    meta.inputs === undefined
      ? opts.args
      : await decodeWithSchema(
          meta.inputs as Schema.Schema<unknown>,
          opts.args,
          `Invalid inputs for workflow '${meta.name}'`,
        ).catch((error: unknown) => {
          // Distinguish an invocation fault (caller passed the wrong args) from every other
          // failure a workflow run can raise: the SOURCE is not at fault here, so a host-side
          // repair funnel must correct the ARGS, never rewrite the body. Typed, not a message
          // regex — see WorkflowInputDecodeError's doc comment.
          throw new WorkflowInputDecodeError(
            error instanceof Error ? error.message : String(error),
            error,
          );
        });
  // Build the Thread-model globals; capability-gate askUser/notifyUser against meta.capabilities.
  const capabilities = normalizeCapabilities(meta);
  if (opts.parentCapabilities !== undefined) {
    assertChildCapabilitiesSubset({
      childName: meta.name,
      childCapabilities: capabilities,
      parentCapabilities: opts.parentCapabilities,
    });
  }
  opts.onCapabilities?.(capabilities);
  const threads = createThreadPrimitives({
    dispatch: opts.handleDispatch,
    broker: opts.broker ?? defaultBroker,
    capabilities,
    launchThreadId: opts.launchThreadId,
    defaultModel: opts.defaultModel,
    log: opts.primitives.log,
  });
  // `waitUntil` (Epic 27) — capability-gated against the same meta.capabilities (`"schedule"`).
  const schedule = createSchedulePrimitives({
    dispatch: opts.handleDispatch,
    broker: opts.broker ?? defaultBroker,
    capabilities,
  });
  const globals = buildWorkflowGlobals({
    args: decodedArgs,
    tools: buildToolTree(opts.toolRefs, opts.runtime, capabilities),
    // The `"script"` engine capability gates whether `scripts.*` is bound AT ALL; it does not
    // gate which scripts are callable — that is limited by recipe ownership (Epic 25 §Scripts).
    scripts: capabilities.has("script") ? buildScriptTree(opts.scripts, opts.runtime) : {},
    runtime: opts.runtime,
    primitives: opts.primitives,
    threads,
    schedule,
    // The `RunbookContext` subset (`@runbook/core/authoring`) a `run(ctx)`-shaped body sees;
    // legacy bodies declare zero parameters and the loader never passes this to them.
    ctx: buildRunbookContext({ toolRefs: opts.toolRefs, runtime: opts.runtime, capabilities }),
  });
  // Bind the SAME surface the body-scope injection uses, so an IMPORTED `agent`/`phase`/… resolves
  // too (Epic 25 §The engine API — imported, not injected). Both paths are live during the
  // migration: existing bodies keep working, new ones can import.
  const output = await withWorkflowRuntime(opts.runtime, () =>
    withBodyApi(globals, () => runWorkflowBody(prepared, source, globals)),
  );
  // The body returned while the run is suspended — it caught the suspension signal. Re-raise
  // BEFORE decoding `output`, or a catch branch's stand-in value would be reported as an invalid
  // result (a source fault) instead of what it is: a run that has to park and resume.
  opts.handleDispatch.assertNotSuspended?.();
  if (meta.outputs === undefined) return output;
  return await decodeWithSchema(
    meta.outputs as Schema.Schema<unknown>,
    output,
    `Invalid result from workflow '${meta.name}'`,
  );
}
