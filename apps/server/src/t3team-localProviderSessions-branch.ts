import * as Effect from "effect/Effect";

import * as VcsProcess from "./vcs/VcsProcess.ts";

const branchByWorkspace = new Map<string, string | null>();

export const resolveLocalProviderSessionBranch = Effect.fn(
  "localProviderSessions.resolveBranch",
)(function* (cwd: string, recordedBranch: string | null) {
  if (recordedBranch) return recordedBranch;
  if (branchByWorkspace.has(cwd)) return branchByWorkspace.get(cwd) ?? null;
  const vcsProcess = yield* VcsProcess.VcsProcess;
  const result = yield* vcsProcess
    .run({
      operation: "localProviderSessions.resolveBranch",
      command: "git",
      args: ["branch", "--show-current"],
      cwd,
      timeoutMs: 2_000,
      maxOutputBytes: 8_192,
    })
    .pipe(Effect.option);
  const branch = result._tag === "Some" ? result.value.stdout.trim() || null : null;
  branchByWorkspace.set(cwd, branch);
  return branch;
});
