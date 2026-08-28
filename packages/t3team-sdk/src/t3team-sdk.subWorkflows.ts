/**
 * Sub-orchestration invocation policy: the cycle guard, the depth backstop, and the capability
 * chaining that lets `workflow()` nest to any depth.
 *
 * Separate from `t3team-sdk.bodyRunner.ts` on purpose: that module answers "load a body and run it
 * once"; this one answers "when a running body invokes ANOTHER body, what is allowed" — policy,
 * not loading, and the part a reader looking for the nesting rules should find without the loader.
 */

import { createWorkflowPrimitives, type WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import { childBrokerFor } from "./t3team-sdk.broker.ts";
import { defaultBroker } from "./t3team-sdk.bodyTrees.ts";
import type { DurableWorkflowRuntime } from "./t3team-sdk.durableRuntime.ts";
import { WorkflowError } from "./t3team-sdk.errors.ts";
import { runPreparedBody } from "./t3team-sdk.bodyRunner.ts";
import type * as T from "./t3team-sdk.types.ts";

/**
 * Hard ceiling on `workflow()` nesting depth. Not a design limit — a runaway backstop, set far
 * above any composition a human would author, so a mutually-recursive pair that somehow slips past
 * the cycle check below still terminates with a nameable error instead of blowing the JS stack.
 * If you legitimately hit this, the composition is the problem.
 */
const MAX_SUB_WORKFLOW_DEPTH = 16;

/**
 * The chain of sub-workflow refs on the path from the root body to the call being made, innermost
 * last. Threaded through by VALUE, never held as shared mutable state.
 *
 * That distinction is the whole design, and an earlier revision got it wrong: it used one
 * push/pop stack shared by the whole run. Under `parallel`, sibling thunks run CONCURRENTLY, so
 * that stack broke in two ways at once — two siblings invoking the same sub-workflow saw each
 * other's push and refused a perfectly legal composition as "recursion", and `pop()` removed
 * whichever entry happened to be last rather than the one that call had pushed, so the chain was
 * simply wrong mid-flight. A shared stack cannot model concurrent siblings, because siblings are
 * not a stack.
 *
 * An immutable chain has neither problem: each call gets its own, siblings cannot see each other,
 * and nothing has to be unwound on the way out — a thrown child leaves no residue for the sibling
 * the parent runs next.
 *
 * Identity is `absolutePath`, not `path`: two refs written differently (`./a.workflow.ts` from one
 * directory, `../x/a.workflow.ts` from another) are the same body and must be caught as one.
 *
 * Refusing recursion outright, rather than bounding it, is deliberate: a recursive body cannot
 * replay — every iteration writes entries at a `seq` that depends on how many iterations ran
 * before it, so a resume re-entering with different data drifts.
 */
type SubWorkflowChain = ReadonlyArray<string>;

/** Returns the chain extended by `ref`, or throws if that would recurse or exceed the backstop. */
function extendChain(chain: SubWorkflowChain, ref: T.WorkflowRef): SubWorkflowChain {
  if (chain.includes(ref.absolutePath)) {
    throw new WorkflowError(
      `workflow('${ref.path}') is already running in this call chain — sub-workflow recursion is refused. ` +
        `Chain: ${[...chain, ref.absolutePath].join(" -> ")}`,
    );
  }
  if (chain.length >= MAX_SUB_WORKFLOW_DEPTH) {
    throw new WorkflowError(
      `workflow('${ref.path}') exceeds the maximum sub-workflow depth of ${MAX_SUB_WORKFLOW_DEPTH}.`,
    );
  }
  return [...chain, ref.absolutePath];
}

/**
 * Build the workflow-body primitive set for a run: agent/wait/budget/etc. wired to the durable
 * runtime, plus a `workflow()` that runs a sub-workflow INLINE — in this run's own journal
 * sequence, at any depth.
 *
 * Sub-workflows are first class: a child gets the same primitive set the root body has, drives the
 * same launching thread (`launchThreadId` is passed straight through, so `askUser` from any depth
 * reaches the user who started the run), shares the recipe's `scripts` tree, and journals its own
 * primitive calls — so it can durably suspend on a question and resume days later exactly like a
 * root body. What it CANNOT do is exceed its parent's capabilities: `parentCapabilities` is the
 * invoking body's normalized set, and a child declaring anything outside it is refused before it
 * runs.
 *
 * `captureCapabilities` must be fed the top-level body's capability set (runPreparedBody's
 * `onCapabilities`). Each child then reports its own, so a grandchild is intersected against its
 * immediate parent rather than against the root — capabilities narrow monotonically down the chain.
 */
export function buildWorkflowPrimitives(opts: {
  readonly runtime: DurableWorkflowRuntime;
  readonly options: T.WorkflowRunOptions;
  readonly toolRefs: ReadonlyArray<T.AnyToolRef>;
  readonly scripts: Readonly<Record<string, T.AnyScriptRef>>;
  /** Host timestamp formatter for artifact records (threaded to sub-workflow children too). */
  readonly nowIso: () => string;
}): {
  readonly primitives: WorkflowPrimitives;
  readonly captureCapabilities: (capabilities: ReadonlySet<string>) => void;
} {
  const { runtime, options } = opts;
  const broker = options.broker ?? defaultBroker;
  const shared = {
    callPrimitive: runtime.callPrimitive,
    runBlackBoxed: runtime.runBlackBoxed,
    spentAgentTokens: runtime.spentAgentTokens,
    hostNow: runtime.hostNow,
    budgetTotal: options.budget ?? 0,
    onPhase: options.onPhase ?? (() => {}),
    onLog: options.onLog ?? (() => {}),
    hostUuid: runtime.hostUuid,
    nowIso: opts.nowIso,
  };

  /**
   * Runs `ref` as a child of a body whose own capability set is `callerCapabilities`, and hands
   * that child a primitive set whose `workflow()` recurses through here again — which is what makes
   * depth unbounded. The child's own capabilities are captured as it starts, so ITS children are
   * gated against it rather than against the root.
   *
   * `invokeOpts` is THIS call's `workflow(ref, args, opts)` third argument — the caller's
   * per-`HandleKind` effect-interception handlers, if any. `childBrokerFor` composes them over
   * `broker` for just this one child; every other sibling and every deeper grandchild (unless it
   * declares its own) still reaches the same real `broker` this closure was built with.
   */
  const runSubWorkflowFor =
    (callerCapabilities: () => ReadonlySet<string>, chain: SubWorkflowChain) =>
    async (
      ref: T.WorkflowRef,
      args: unknown,
      invokeOpts?: T.WorkflowInvokeOpts,
    ): Promise<unknown> => {
      const childChain = extendChain(chain, ref);
      let childCapabilities: ReadonlySet<string> = new Set();
      return await runPreparedBody({
        runtime,
        ref,
        args,
        toolRefs: opts.toolRefs,
        scripts: opts.scripts,
        primitives: createWorkflowPrimitives({
          ...shared,
          runSubWorkflow: runSubWorkflowFor(() => childCapabilities, childChain),
        }),
        handleDispatch: runtime.handles,
        broker: childBrokerFor(broker, invokeOpts),
        parentCapabilities: callerCapabilities(),
        onCapabilities: (capabilities) => {
          childCapabilities = capabilities;
        },
        ...(options.launchThreadId === undefined ? {} : { launchThreadId: options.launchThreadId }),
        ...(options.defaultModel === undefined ? {} : { defaultModel: options.defaultModel }),
      });
    };

  // Filled by the top-level body's meta extraction, which always precedes any workflow() call.
  let rootCapabilities: ReadonlySet<string> = new Set();
  return {
    primitives: createWorkflowPrimitives({
      ...shared,
      runSubWorkflow: runSubWorkflowFor(() => rootCapabilities, []),
    }),
    captureCapabilities: (capabilities) => {
      rootCapabilities = capabilities;
    },
  };
}
