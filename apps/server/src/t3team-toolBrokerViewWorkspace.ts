export type T3TeamViewWorkspaceThread = {
  readonly branch: string | null;
  readonly worktreePath: string | null;
};

export type T3TeamViewWorkspaceProject = {
  readonly workspaceRoot: string;
};

export function buildThreadWorkspaceView(input: {
  readonly thread: T3TeamViewWorkspaceThread;
  readonly project: T3TeamViewWorkspaceProject | undefined;
}) {
  const worktreePath = input.thread.worktreePath ?? null;
  const executionScope = worktreePath ? "repository" : "metarepo";
  const projectWorkspaceRoot = input.project?.workspaceRoot ?? null;

  return {
    executionScope,
    workspace: {
      executionScope,
      projectWorkspaceRoot,
      currentWorkspaceRoot: worktreePath ?? projectWorkspaceRoot,
      worktreePath,
      branch: input.thread.branch ?? null,
    },
  };
}
