/**
 * Sub-orchestration invocation policy: the cycle guard, the depth backstop, and the capability
 * chaining that lets `workflow()` nest to any depth.
 *
 * Separate from `t3team-sdk.bodyRunner.ts` on purpose. That module answers "load a body and run it
 * once"; this one answers "when a running body invokes ANOTHER body, what is allowed" — which is
 * policy, not loading, and is the part a reader looking for the nesting rules should find without
 * reading the loader. (The same reason bodyRunner was itself split out of `workflowRunner.ts`.)
 */

import { createWorkflowPrimitives, type WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import { defaultBroker } from "./t3team-sdk.bodyTrees.ts";
import type { DurableWorkflowRuntime } from "./t3team-sdk.durableRuntime.ts";
import { WorkflowError } from "./t3team-sdk.errors.ts";
import { runPreparedBody } from "./t3team-sdk.bodyRunner.ts";
import type * as T from "./t3team-sdk.types.ts";

/**
 * Hard ceiling on `workflow()` nesting depth. Not a design limit — a runaway backstop, set far
 * above any composition a human would author, so a mutually-recursive pair that somehow slips past
 * {@link SubWorkflowStack}'s cycle check still terminates with a nameable error instead of blowing
 * the JS stack. If you legitimately hit this, the composition is the problem.
 */
const MAX_SUB_WORKFLOW_DEPTH = 16;

/**
 * The chain of sub-workflow refs currently executing, innermost last.
 *
 * Depth is no longer capped at one (see `composition.ts`'s `workflow`), so recursion has to be
 * refused explicitly rather than falling out of the old "a child gets no executor" trick. Identity
 * is `absolutePath`, not `path`: two refs written differently (`./a.workflow.ts` from one directory,
 * `../x/a.workflow.ts` from another) are the same body and must be caught as one.
 *
 * Refusing recursion outright, rather than bounding it, is deliberate. A recursive body cannot
 * replay: every iteration writes journal entries at a `seq` that depends on how many iterations ran
 * before it, so a resume that re-enters the recursion with different data drifts. `wait`, `parallel`
 * and a loop in the parent body cover every case a recursive sub-workflow would have.
 */
class SubWorkflowStack {
  private readonly entries: string[] = [];

  enter(ref: T.WorkflowRef): void {
    if (this.entries.includes(ref.absolutePath)) {
      throw new WorkflowError(
        `workflow('${ref.path}') is already running in this call chain — sub-workflow recursion is refused. ` +
          `Chain: ${[...this.entries, ref.absolutePath].join(" -> ")}`,
      );
    }
    if (this.entries.length >= MAX_SUB_WORKFLOW_DEPTH) {
      throw new WorkflowError(
        `workflow('${ref.path}') exceeds the maximum sub-workflow depth of ${MAX_SUB_WORKFLOW_DEPTH}.`,
      );
    }
    this.entries.push(ref.absolutePath);
  }

  exit(): void {
    this.entries.pop();
  }
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
  };
  const stack = new SubWorkflowStack();

  /**
   * Runs `ref` as a child of a body whose own capability set is `callerCapabilities`, and hands
   * that child a primitive set whose `workflow()` recurses through here again — which is what makes
   * depth unbounded. The child's own capabilities are captured as it starts, so ITS children are
   * gated against it rather than against the root.
   */
  const runSubWorkflowFor =
    (callerCapabilities: () => ReadonlySet<string>) =>
    async (ref: T.WorkflowRef, args: unknown): Promise<unknown> => {
      stack.enter(ref);
      try {
        let childCapabilities: ReadonlySet<string> = new Set();
        return await runPreparedBody({
          runtime,
          ref,
          args,
          toolRefs: opts.toolRefs,
          scripts: opts.scripts,
          primitives: createWorkflowPrimitives({
            ...shared,
            runSubWorkflow: runSubWorkflowFor(() => childCapabilities),
          }),
          handleDispatch: runtime.handles,
          broker,
          parentCapabilities: callerCapabilities(),
          onCapabilities: (capabilities) => {
            childCapabilities = capabilities;
          },
          ...(options.launchThreadId === undefined
            ? {}
            : { launchThreadId: options.launchThreadId }),
          ...(options.defaultModel === undefined ? {} : { defaultModel: options.defaultModel }),
        });
      } finally {
        // Popped even when the child throws, so one failed sub-run does not poison the chain for a
        // sibling the parent runs afterwards.
        stack.exit();
      }
    };

  // Filled by the top-level body's meta extraction, which always precedes any workflow() call.
  let rootCapabilities: ReadonlySet<string> = new Set();
  return {
    primitives: createWorkflowPrimitives({
      ...shared,
      runSubWorkflow: runSubWorkflowFor(() => rootCapabilities),
    }),
    captureCapabilities: (capabilities) => {
      rootCapabilities = capabilities;
    },
  };
}
