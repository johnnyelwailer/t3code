/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Integration eval bridges Effect runtimes with real git worktrees. */
// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node git setup helpers.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { TOOL_SPECS } from "./t3team-toolBrokerHelpers.ts";
import { renderAgentsMd } from "./t3team-projectSetupContent.ts";
import { getT3TeamProfile } from "@t3tools/t3team-skill-packs";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import { T3TeamThreadToolContextStoreLive } from "./t3team-threadToolContextStore.ts";
import {
  NoopT3TeamContextRefreshService,
  T3TeamContextRefreshService,
} from "./t3team-contextRefreshService.ts";
import { T3TeamToolBrokerLive } from "./t3team-toolBrokerLive.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";

const EVAL_REPO_FULL_NAME = "eval-owner/eval-repo";
const META_REPO_FULL_NAME = "eval-owner/eval-monorepo";

type StoredThread = {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
};

const evalRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-start-child-eval-"));
const projectWorkspaceRoot = NodePath.join(evalRoot, "project-workspace");
const linkedRepoPath = NodePath.join(evalRoot, "linked-repo");
const localWorkspaceRoot = NodePath.join(evalRoot, "local-workspace");
const metaWorkspaceRoot = NodePath.join(evalRoot, "monorepo-workspace");
let evalHarnessReady = false;

function runGit(cwd: string, args: ReadonlyArray<string>) {
  const result = NodeChildProcess.spawnSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed in ${cwd}: ${result.stderr?.toString() ?? result.status}`,
    );
  }
}

function initGitRepo(root: string) {
  NodeFS.mkdirSync(root, { recursive: true });
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "eval@test.com"]);
  runGit(root, ["config", "user.name", "Eval"]);
  NodeFS.writeFileSync(NodePath.join(root, "README.md"), "# eval repo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
  runGit(root, ["branch", "-M", "main"]);
}

function initLinkedRepo() {
  NodeFS.mkdirSync(projectWorkspaceRoot, { recursive: true });
  initGitRepo(linkedRepoPath);

  const manifestDir = NodePath.join(projectWorkspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  NodeFS.mkdirSync(manifestDir, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(manifestDir, MANIFEST_FILE_NAME),
    JSON.stringify({
      linkedRepositories: [
        {
          url: `https://github.com/${EVAL_REPO_FULL_NAME}`,
          localPath: linkedRepoPath,
          status: "cloned",
        },
      ],
    }),
    "utf8",
  );
}

/** A project workspace that is itself a git repository, with no linked-repo manifest. */
function initLocalWorkspace() {
  initGitRepo(localWorkspaceRoot);
}

/** An adopted monorepo-as-meta-repo: the workspace root is a real git repository whose
 * reference manifest carries a `metaRepository` entry alongside linked repositories. */
function initMetaWorkspace() {
  initGitRepo(metaWorkspaceRoot);

  const manifestDir = NodePath.join(metaWorkspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  NodeFS.mkdirSync(manifestDir, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(manifestDir, MANIFEST_FILE_NAME),
    JSON.stringify({
      workspaceRoot: metaWorkspaceRoot,
      referencesRoot: manifestDir,
      workspaceRepositoryInitialized: false,
      metaRepository: {
        url: `https://github.com/${META_REPO_FULL_NAME}`,
        localPath: metaWorkspaceRoot,
        status: "adopted",
      },
      linkedRepositories: [
        {
          url: `https://github.com/${EVAL_REPO_FULL_NAME}`,
          localPath: linkedRepoPath,
          status: "cloned",
        },
      ],
    }),
    "utf8",
  );
}

function ensureEvalHarnessReady() {
  if (evalHarnessReady) {
    return;
  }
  initLinkedRepo();
  initLocalWorkspace();
  initMetaWorkspace();
  evalHarnessReady = true;
}

afterAll(() => {
  NodeFS.rmSync(evalRoot, { recursive: true, force: true });
});

type EvalVariant = {
  readonly projectId: ProjectId;
  readonly parentThreadId: ThreadId;
  readonly workspaceRoot: string;
  readonly projectTitle: string;
};

const linkedVariant: EvalVariant = {
  projectId: ProjectId.make("project-eval"),
  parentThreadId: ThreadId.make("parent-thread-eval"),
  workspaceRoot: projectWorkspaceRoot,
  projectTitle: "Eval Project",
};

const localVariant: EvalVariant = {
  projectId: ProjectId.make("project-local-eval"),
  parentThreadId: ThreadId.make("parent-thread-local-eval"),
  workspaceRoot: localWorkspaceRoot,
  projectTitle: "Eval Local Project",
};

const metaVariant: EvalVariant = {
  projectId: ProjectId.make("project-meta-eval"),
  parentThreadId: ThreadId.make("parent-thread-meta-eval"),
  workspaceRoot: metaWorkspaceRoot,
  projectTitle: "Eval Monorepo Project",
};

function createEvalHarness(variant: EvalVariant = linkedVariant) {
  ensureEvalHarnessReady();
  const threads = new Map<ThreadId, StoredThread>([
    [
      variant.parentThreadId,
      {
        id: variant.parentThreadId,
        projectId: variant.projectId,
        title: "Coordinator thread",
        branch: null,
        worktreePath: null,
      },
    ],
  ]);
  let sequence = 0;

  const orchestrationMock: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    streamDomainEvents: Stream.empty,
    latestSequence: Effect.sync(() => sequence),
    dispatch: (command) =>
      Effect.sync(() => {
        sequence += 1;
        if (
          typeof command === "object" &&
          command !== null &&
          (command as { type?: string }).type === "thread.create"
        ) {
          const create = command as {
            threadId: ThreadId;
            title: string;
            branch?: string | null;
            worktreePath?: string | null;
          };
          threads.set(create.threadId, {
            id: create.threadId,
            projectId: variant.projectId,
            title: create.title,
            branch: create.branch ?? null,
            worktreePath: create.worktreePath ?? null,
          });
        }
        return { sequence };
      }),
  };

  const projectionQueryMock: ProjectionSnapshotQueryShape = {
    getCommandReadModel: () => Effect.die("unused"),
    getSnapshot: () => Effect.die("unused"),
    getShellSnapshot: () => Effect.die("unused"),
    getArchivedShellSnapshot: () => Effect.die("unused"),
    getSnapshotSequence: () => Effect.die("unused"),
    getCounts: () => Effect.die("unused"),
    getActiveProjectByWorkspaceRoot: () => Effect.die("unused"),
    getProjectShellById: () =>
      Effect.succeed(
        Option.some({
          id: variant.projectId,
          title: variant.projectTitle,
          workspaceRoot: variant.workspaceRoot,
          repositoryIdentity: null,
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    getFirstActiveThreadIdByProjectId: () => Effect.die("unused"),
    listChildThreadIdsByParent: () => Effect.die("unused"),
    listParentChildRelations: () => Effect.die("unused"),
    getThreadCheckpointContext: () => Effect.die("unused"),
    getThreadDetailSnapshot: () => Effect.die("unused"),
    getFullThreadDiffContext: () => Effect.die("unused"),
    getThreadShellById: () => Effect.die("unused"),
    getThreadDetailById: (threadId) => {
      const thread = threads.get(threadId);
      if (!thread) {
        return Effect.succeed(Option.none());
      }
      return Effect.succeed(
        Option.some({
          id: thread.id,
          projectId: thread.projectId,
          title: thread.title,
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.4-mini",
          },
          runtimeMode: "full-access" as const,
          interactionMode: "default" as const,
          branch: thread.branch,
          worktreePath: thread.worktreePath,
          latestTurn: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          deletedAt: null,
          messages: [],
          proposedPlans: [],
          activities: [],
          checkpoints: [],
          session: null,
        }),
      );
    },
    threadExists: () => Effect.die("unused"),
    hasPendingTurnStart: () => Effect.die("unused"),
    searchThreads: () => Effect.succeed({ matches: [] }),
  };

  const gitVcsLayer = GitVcsDriver.layer.pipe(
    Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-start-child-eval-git-" })),
    Layer.provide(NodeServices.layer),
  );

  const gitWorkflowLayer = Layer.effect(
    GitWorkflowService,
    Effect.gen(function* () {
      const git = yield* GitVcsDriver.GitVcsDriver;
      return {
        createWorktree: (input) => git.createWorktree(input),
      } as GitWorkflowService["Service"];
    }),
  ).pipe(Layer.provide(gitVcsLayer));

  const brokerLayer = T3TeamToolBrokerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ProjectionSnapshotQuery, projectionQueryMock),
        Layer.succeed(OrchestrationEngineService, orchestrationMock),
        Layer.succeed(T3TeamContextRefreshService, NoopT3TeamContextRefreshService),
        T3TeamThreadToolContextStoreLive,
        gitWorkflowLayer,
        gitVcsLayer,
        Layer.succeed(SourceControlProviderRegistry, {
          resolve: () =>
            Effect.succeed({
              getDefaultBranch: () => Effect.succeed("main"),
            }),
          resolveHandle: () =>
            Effect.succeed({
              provider: {
                getDefaultBranch: () => Effect.succeed("main"),
              },
              context: null,
            }),
        } as unknown as SourceControlProviderRegistry["Service"]),
        Layer.succeed(ProjectSetupScriptRunner, {
          runForThread: () => Effect.succeed({ status: "no-script" as const }),
        } as unknown as ProjectSetupScriptRunner["Service"]),
        NodeServices.layer,
      ),
    ),
  );

  const toolContext = {
    surface: "t3team" as const,
    tools: [
      { id: "t3team.thread.start_child", label: "Start child", capabilities: ["write"] as const },
      { id: "t3team.view.read", label: "Read view", capabilities: ["read"] as const },
    ],
    state: {
      view: {
        kind: "thread" as const,
        projectId: variant.projectId,
        projectTitle: variant.projectTitle,
        workspaceRoot: variant.workspaceRoot,
        threadId: variant.parentThreadId,
        threadTitle: "Coordinator thread",
        ticketId: "EVAL-1",
        displayMode: "embedded" as const,
      },
    },
  };

  return {
    threads,
    runBroker: <A>(program: Effect.Effect<A, never, T3TeamToolBroker>) =>
      Effect.runPromise(program.pipe(Effect.provide(brokerLayer), Effect.scoped)),
    toolContext,
  };
}

describe("t3team.thread.start_child isolation integration eval", () => {
  it("marks isolation required in the published tool schema with a description on every parameter", () => {
    const schema = TOOL_SPECS["t3team.thread.start_child"].inputSchema as {
      required?: ReadonlyArray<string>;
      properties?: Record<string, { enum?: ReadonlyArray<string>; description?: string }>;
    };
    expect(schema.required).toEqual(["name", "isolation"]);
    expect(schema.properties?.isolation?.enum).toEqual(["shared", "own-worktree"]);
    // Every parameter carries a non-empty, agent-facing description.
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      expect(
        typeof property.description === "string" && property.description.trim().length > 0,
        `start_child parameter '${key}' must have a description`,
      ).toBe(true);
    }
  });

  it("documents the isolation decision table in AGENTS.md", () => {
    const agentsMd = renderAgentsMd(getT3TeamProfile("engineering-copilot"));
    expect(agentsMd).toContain("always pass `isolation`");
    expect(agentsMd).toContain("| Work | `isolation` | Repository fields |");
    expect(agentsMd).toContain("Planning, triage, synthesis, project status");
    expect(agentsMd).toContain("Implementation, debugging, tests, review, PR work");
    expect(agentsMd).toContain("Do not pass `repo_full_name`");
    expect(agentsMd).toContain("Pass `repo_full_name`");
  });

  it("scenario A: vague planning stays in the shared checkout without a worktree", async () => {
    const harness = createEvalHarness();
    const { startResult, childView } = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: linkedVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        const startResult = yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Plan checkout reliability",
            isolation: "shared",
            kickoff_mode: "plan",
            kickoff_prompt:
              "Review ticket context and outline how we should improve checkout reliability across linked repos.",
          },
        });
        const structured = startResult.structuredContent as { project_session_id: string };
        const childBinding = yield* broker.bindSession({
          threadId: ThreadId.make(structured.project_session_id),
        });
        const childView = yield* childBinding!.callTool({
          server: "t3team",
          tool: "t3team.view.read",
        });
        return { startResult, childView };
      }),
    );

    const structured = startResult.structuredContent as {
      isolation: string;
      execution_scope: string;
      project_session_id: string;
      worktree_path?: string;
    };
    expect(startResult.isError).toBeUndefined();
    expect(structured.isolation).toBe("shared");
    expect(structured.execution_scope).toBe("metarepo");
    expect(structured.worktree_path).toBeUndefined();

    const childThread = harness.threads.get(ThreadId.make(structured.project_session_id));
    expect(childThread?.worktreePath).toBeNull();
    expect(childThread?.branch).toBeNull();

    const view = childView.structuredContent as {
      thread: { executionScope: string; workspace: { worktreePath: string | null } };
    };
    expect(view.thread.executionScope).toBe("metarepo");
    expect(view.thread.workspace.worktreePath).toBeNull();
  });

  it("scenario B: implement-it follow-up creates a linked-repo worktree", async () => {
    const harness = createEvalHarness();
    const { startResult, childView } = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: linkedVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        const startResult = yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Implement checkout fix",
            isolation: "own-worktree",
            repo_full_name: EVAL_REPO_FULL_NAME,
            kickoff_prompt: "Implement the planned checkout reliability fix in this repository.",
          },
        });
        const structured = startResult.structuredContent as { project_session_id: string };
        const childBinding = yield* broker.bindSession({
          threadId: ThreadId.make(structured.project_session_id),
        });
        const childView = yield* childBinding!.callTool({
          server: "t3team",
          tool: "t3team.view.read",
        });
        return { startResult, childView };
      }),
    );

    const structured = startResult.structuredContent as {
      isolation: string;
      execution_scope: string;
      repo_full_name: string;
      project_session_id: string;
      worktree_path: string;
      branch: string;
    };
    expect(startResult.isError).toBeUndefined();
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.execution_scope).toBe("repository");
    expect(structured.repo_full_name).toBe(EVAL_REPO_FULL_NAME);
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(
      NodeChildProcess.spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: structured.worktree_path,
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe("true");

    const view = childView.structuredContent as {
      thread: {
        executionScope: string;
        workspace: {
          executionScope: string;
          worktreePath: string;
          currentWorkspaceRoot: string;
          branch: string;
        };
      };
    };
    expect(view.thread.executionScope).toBe("repository");
    expect(view.thread.workspace.worktreePath).toBe(structured.worktree_path);
    expect(view.thread.workspace.currentWorkspaceRoot).toBe(structured.worktree_path);
    expect(view.thread.workspace.branch).toBe(structured.branch);
  });

  it("scenario C: ambiguous tool calls fail with clear validation errors", async () => {
    const harness = createEvalHarness();
    const call = (arguments_: Record<string, unknown>) =>
      harness.runBroker(
        Effect.gen(function* () {
          const broker = yield* T3TeamToolBroker;
          const binding = yield* broker.bindSession({
            threadId: linkedVariant.parentThreadId,
            toolContext: harness.toolContext,
          });
          return yield* binding!.callTool({
            server: "t3team",
            tool: "t3team.thread.start_child",
            arguments: arguments_,
          });
        }),
      );

    const missingIsolation = await call({ name: "Ambiguous child" });
    expect(missingIsolation.isError).toBe(true);
    expect(missingIsolation.structuredContent).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("requires 'isolation'"),
      }),
    );

    const sharedWithRepo = await call({
      name: "Planning child",
      isolation: "shared",
      repo_full_name: EVAL_REPO_FULL_NAME,
    });
    expect(sharedWithRepo.isError).toBe(true);
    expect(sharedWithRepo.structuredContent).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("must not include 'repo_full_name'"),
      }),
    );

    const ownWorktreeWithoutRepo = await call({
      name: "Detached implementation",
      isolation: "own-worktree",
    });
    expect(ownWorktreeWithoutRepo.isError).toBe(true);
    expect(ownWorktreeWithoutRepo.structuredContent).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("pass 'repo_full_name'"),
      }),
    );
  });

  it("scenario D: local workspace isolates in a worktree of the local repository", async () => {
    const harness = createEvalHarness(localVariant);
    const { startResult, childView } = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: localVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        const startResult = yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Fix local checkout",
            isolation: "own-worktree",
            kickoff_prompt: "Fix the checkout bug in this local repository.",
          },
        });
        const structured = startResult.structuredContent as { project_session_id: string };
        const childBinding = yield* broker.bindSession({
          threadId: ThreadId.make(structured.project_session_id),
        });
        const childView = yield* childBinding!.callTool({
          server: "t3team",
          tool: "t3team.view.read",
        });
        return { startResult, childView };
      }),
    );

    const structured = startResult.structuredContent as {
      isolation: string;
      execution_scope: string;
      project_session_id: string;
      worktree_path: string;
      branch: string;
      repo_full_name?: string;
    };
    expect(startResult.isError).toBeUndefined();
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.execution_scope).toBe("repository");
    expect(structured.repo_full_name).toBeUndefined();
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(
      NodeChildProcess.spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: structured.worktree_path,
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe("true");
    // The worktree lives inside the local repository and .t3team/ is gitignored.
    expect(structured.worktree_path.startsWith(localWorkspaceRoot)).toBe(true);
    expect(structured.worktree_path).toContain("child-session-worktrees");
    const gitignore = NodeFS.readFileSync(NodePath.join(localWorkspaceRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain(".t3team/");

    const view = childView.structuredContent as {
      thread: {
        executionScope: string;
        workspace: { worktreePath: string; currentWorkspaceRoot: string; branch: string };
      };
    };
    expect(view.thread.executionScope).toBe("repository");
    expect(view.thread.workspace.worktreePath).toBe(structured.worktree_path);
    expect(view.thread.workspace.currentWorkspaceRoot).toBe(structured.worktree_path);
    expect(view.thread.workspace.branch).toBe(structured.branch);
  });

  it("scenario E: repo_full_name in a local workspace fails with a clear error", async () => {
    const harness = createEvalHarness(localVariant);
    const result = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: localVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Wrong repo child",
            isolation: "own-worktree",
            repo_full_name: EVAL_REPO_FULL_NAME,
          },
        });
      }),
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("no linked repositories"),
      }),
    );
  });

  it("scenario F: the deprecated execution_scope alias still works and notes the deprecation", async () => {
    const harness = createEvalHarness();
    const result = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: linkedVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Legacy planning child",
            execution_scope: "metarepo",
          },
        });
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        isolation: "shared",
        execution_scope: "metarepo",
        deprecation_note: expect.stringContaining("'isolation'"),
      }),
    );
  });

  it("scenario G: monorepo-as-metarepo project isolates without repo_full_name in a meta-repo worktree", async () => {
    const harness = createEvalHarness(metaVariant);
    const startResult = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: metaVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Monorepo implementation",
            isolation: "own-worktree",
          },
        });
      }),
    );
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      isolation: string;
      worktree_path: string;
      branch: string;
      repo_full_name?: string;
    };
    expect(structured.isolation).toBe("own-worktree");
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(structured.worktree_path.startsWith(metaWorkspaceRoot)).toBe(true);
    expect(structured.worktree_path).toContain("child-session-worktrees");
    // The worktree's main worktree is the meta-repo itself (monorepo work, GHE #42).
    const worktreeCommonDir = NodeChildProcess.spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: structured.worktree_path,
      encoding: "utf8",
    }).stdout.trim();
    expect(worktreeCommonDir).toBe(NodePath.join(NodeFS.realpathSync(metaWorkspaceRoot), ".git"));
    // The meta-repo keeps only machine-local subpaths ignored, so committed team state under
    // .t3team/ survives the worktree.
    const gitignore = NodeFS.readFileSync(NodePath.join(metaWorkspaceRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain(".t3team/references/");
    expect(gitignore).toContain(".t3team/child-session-worktrees/");
    expect(
      gitignore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .includes(".t3team/"),
    ).toBe(false);
  });

  it("scenario H: repo_full_name matching the meta-repo URL isolates in the meta-repo", async () => {
    const harness = createEvalHarness(metaVariant);
    const startResult = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: metaVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Monorepo explicit repo",
            isolation: "own-worktree",
            repo_full_name: META_REPO_FULL_NAME,
          },
        });
      }),
    );
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      isolation: string;
      worktree_path: string;
      repo_full_name?: string;
    };
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.repo_full_name).toBe(`https://github.com/${META_REPO_FULL_NAME}`);
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(structured.worktree_path.startsWith(metaWorkspaceRoot)).toBe(true);
  });

  it("scenario I: a linked repo in a monorepo project still isolates in that linked repo", async () => {
    const harness = createEvalHarness(metaVariant);
    const startResult = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: metaVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Linked repo implementation",
            isolation: "own-worktree",
            repo_full_name: EVAL_REPO_FULL_NAME,
          },
        });
      }),
    );
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      isolation: string;
      worktree_path: string;
      repo_full_name?: string;
    };
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.repo_full_name).toBe(EVAL_REPO_FULL_NAME);
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(structured.worktree_path.startsWith(metaWorkspaceRoot)).toBe(true);
    // The worktree's main worktree is the LINKED repository, not the meta-repo.
    const worktreeCommonDir = NodeChildProcess.spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: structured.worktree_path,
      encoding: "utf8",
    }).stdout.trim();
    expect(worktreeCommonDir).toBe(NodePath.join(NodeFS.realpathSync(linkedRepoPath), ".git"));
  });
});
