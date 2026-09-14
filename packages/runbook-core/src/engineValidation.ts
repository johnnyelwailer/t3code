import { hashArgs, hashPrefix } from "./canonicalJson.ts";
import { ReplayDriftError } from "./errors.ts";
import type { RunMeta } from "./journal.ts";
import type { WorkflowVersionPolicy } from "./engineTypes.ts";

/** Verify the input hash recorded at the start of a run. */
export function assertInputArgsMatch(opts: {
  readonly meta: RunMeta | undefined;
  readonly args: unknown;
  readonly workflowPath: string;
}): void {
  if (opts.meta === undefined) return;
  const suppliedHash = hashArgs(opts.args);
  if (opts.meta.argsHash !== suppliedHash) {
    throw new ReplayDriftError({
      seq: 0,
      reason: "args",
      expected: { argsHash: hashPrefix(opts.meta.argsHash) },
      observed: { argsHash: hashPrefix(suppliedHash) },
      filePath: opts.workflowPath,
    });
  }
}

/** Verify executable identity when the host supplies version metadata. */
export function assertWorkflowVersionMatch(opts: {
  readonly meta: RunMeta | undefined;
  readonly workflowVersion: string | undefined;
  readonly workflowPath: string;
  readonly policy: WorkflowVersionPolicy | undefined;
}): void {
  const recorded = opts.meta?.workflowVersion;
  if (
    opts.policy === "allow-change" ||
    opts.meta?.workflowPath !== opts.workflowPath ||
    recorded === undefined ||
    opts.workflowVersion === undefined ||
    recorded === opts.workflowVersion
  )
    return;
  throw new ReplayDriftError({
    seq: 0,
    reason: "workflow",
    expected: { workflowVersion: hashPrefix(recorded) },
    observed: { workflowVersion: hashPrefix(opts.workflowVersion) },
    filePath: opts.workflowPath,
  });
}
