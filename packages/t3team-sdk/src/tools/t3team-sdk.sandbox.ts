/**
 * Agent-facing sandboxed checkout + command execution (`t3team.sandbox.run`). The SDK layer owns
 * the id, argument/result schemas, and group classification; the server broker supplies the
 * actual checkout and process execution via `ctx.t3team.runSandbox` — the same "SDK owns the
 * contract, HOST owns the execution" split as `t3team.orchestration.run`
 * (`t3team-sdk.workflow.ts`). The SDK must not spawn processes, import `node:child_process`, or
 * know what a container is; a missing host client fails with a clear error naming what is
 * missing, exactly like `t3team.orchestration.run` does today.
 *
 * INVARIANT — the agent never receives a credential. This tool takes a `ref` (what to check out)
 * and a `command` (what to run against it), and nothing else that could carry a secret: no token,
 * no URL with embedded credentials, no path outside the sandbox. The HOST resolves `ref` into a
 * real checkout using whatever credentials it already holds; those credentials never cross into
 * the tool call, the result, or the agent's context window.
 *
 * Why this exists: without it, an orchestration verifying a finding (a code review, a migration
 * safety check) can only read a diff — it cannot check out the surrounding codebase at the right
 * commit, run the test suite, or run the app. This tool is what turns a reviewer that can only
 * read into one that can also confirm or refute by running the thing.
 */
import * as Schema from "effect/Schema";

import { t3teamSandboxExecute } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";

export const RunSandboxToolArgs = Schema.Struct({
  /** The git ref to check out — a branch, tag, or SHA. The host resolves and materializes this
   * itself; this field never carries a URL, a token, or a path outside the sandbox. */
  ref: Schema.String,
  /** The command to run inside the checkout, exactly as a shell would receive it. */
  command: Schema.String,
  /** Upper bound on wall-clock execution time, in milliseconds. Advisory only — the host clamps
   * this to its own ceiling, so a caller cannot buy a longer run by asking for one. */
  timeoutMs: Schema.optional(Schema.Number),
});
export type RunSandboxToolArgs = typeof RunSandboxToolArgs.Type;

/**
 * Three outcomes an orchestration must be able to tell apart, and where each one lands:
 *
 * | outcome | how it arrives |
 * | --- | --- |
 * | the command ran and failed | resolves, `timedOut: false`, nonzero `exitCode` |
 * | the command was killed at the deadline | resolves, `timedOut: true` — `exitCode` is meaningless |
 * | the command could never be run | **throws** — a failed checkout, an unresolvable `ref`, or no sandbox host is an ERROR, not a result |
 *
 * The third case is deliberately not a field. A workflow that treats "could not run" as a result
 * will sooner or later read it as a verdict on the code, and "the test suite could not be built"
 * is not evidence that the code is broken. Making it a throw forces the caller to handle it as the
 * separate thing it is.
 */
export const RunSandboxToolResult = Schema.Struct({
  /** The command's own exit code. Meaningful only when `timedOut` is `false` — the exit code of a
   * killed process is an artifact of the kill signal, not a verdict on the command. */
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  /** `true` when the host cut `stdout`/`stderr` short at its output ceiling. A caller must check
   * this before reading a short capture as "the command produced little output" — the host never
   * truncates silently. */
  truncated: Schema.Boolean,
  /** `true` when the host killed the command at `timeoutMs` (or its own ceiling) before it exited
   * on its own. Kept separate from `exitCode` on purpose: "it ran and failed" (nonzero exit) and
   * "we don't know because it was killed at the deadline" (`timedOut`) are different facts, and an
   * orchestration deciding whether to trust the result must be able to tell them apart. */
  timedOut: Schema.Boolean,
});
export type RunSandboxToolResult = typeof RunSandboxToolResult.Type;

export const runSandboxTool = defineTool({
  id: "t3team.sandbox.run",
  group: t3teamSandboxExecute,
  args: RunSandboxToolArgs,
  result: RunSandboxToolResult,
  handler: async (args, ctx) => {
    const ref = args.ref.trim();
    const command = args.command.trim();
    if (ref.length === 0) {
      throw new Error("t3team.sandbox.run requires a non-empty 'ref'.");
    }
    if (command.length === 0) {
      throw new Error("t3team.sandbox.run requires a non-empty 'command'.");
    }
    if (!ctx.t3team?.runSandbox) {
      throw new Error("t3team.sandbox.run requires a t3team sandbox client in ToolHandlerCtx.");
    }
    // The host result is re-validated against RunSandboxToolResult by executeToolHandler.
    return (await ctx.t3team.runSandbox({
      ref,
      command,
      ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
    })) as RunSandboxToolResult;
  },
});
