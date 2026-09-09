/**
 * Repo-scoped child-session tests for the live t3team tool broker (split out
 * of `t3team-toolBroker.test.ts` for the additive LOC budget).
 */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests bridge Effect runtimes manually; tracked cleanup is separate from the green gate. */
import { describe, expect, it, vi } from "vite-plus/test";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  dirnamePosix,
  joinPosix,
  makeBrokerLayerWithOptions,
  makeOrchestrationMock,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";

describe("T3TeamToolBrokerLive repo-scoped child sessions", () => {
  it("creates a repo-scoped child session from a requested linked repository ref", async () => {
    const dispatch = vi.fn((_command: unknown) => Promise.resolve({ sequence: 19 }));
    const exists = vi.fn((candidatePath: string) =>
      Effect.succeed(
        candidatePath === "/workspace/project-1/.t3team/references/reference-repositories.json" ||
          candidatePath === "/linked/pingdotgg/t3code",
      ),
    );
    const readFileString = vi.fn(() =>
      Effect.succeed(
        JSON.stringify({
          linkedRepositories: [
            {
              url: "https://github.com/pingdotgg/t3code",
              localPath: "/linked/pingdotgg/t3code",
              status: "cloned",
            },
          ],
        }),
      ),
    );
    const makeDirectory = vi.fn(() => Effect.void);
    const resolveProvider = vi.fn(() =>
      Effect.succeed({
        getDefaultBranch: () => Effect.succeed("main"),
      }),
    );
    const createWorktree = vi.fn(
      (input: { cwd: string; refName: string; newRefName?: string; path: string | null }) =>
        Effect.succeed({
          worktree: {
            path: input.path ?? "/unexpected",
            refName: "feature/review-repo-child-1a2b3c4d",
          },
        }),
    );
    const runForThread = vi.fn(() => Effect.succeed({ status: "no-script" as const }));
    const orchestrationMock = makeOrchestrationMock((command) =>
      Effect.promise(() => dispatch(command)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: [
              {
                id: "t3team.thread.start_child",
                label: "Start child session",
                capabilities: ["write"],
              },
            ],
          }),
        });

        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Review repo child",
            execution_scope: "repository",
            repo_full_name: "pingdotgg/t3code",
            repo_ref: "release/7.0",
          },
        });
      }).pipe(
        Effect.provide(
          makeBrokerLayerWithOptions(orchestrationMock, {
            startChildServicesLayer: Layer.mergeAll(
              Layer.succeed(FileSystem.FileSystem, {
                exists,
                readFileString,
                makeDirectory,
              } as unknown as FileSystem.FileSystem),
              Layer.succeed(Path.Path, {
                join: joinPosix,
                dirname: dirnamePosix,
              } as unknown as Path.Path),
              Layer.succeed(SourceControlProviderRegistry, {
                resolve: resolveProvider,
              } as unknown as import("./sourceControl/SourceControlProviderRegistry.ts").SourceControlProviderRegistry["Service"]),
              Layer.succeed(GitWorkflowService, {
                createWorktree,
              } as unknown as import("./git/GitWorkflowService.ts").GitWorkflowService["Service"]),
              Layer.succeed(ProjectSetupScriptRunner, {
                runForThread,
              } as unknown as import("./project/ProjectSetupScriptRunner.ts").ProjectSetupScriptRunner["Service"]),
            ),
          }),
        ),
      ),
    );

    const structured = result.structuredContent as {
      project_session_id: string;
      repo_ref: string;
      branch: string;
      worktree_path: string;
    };
    const expectedWorktreePath = joinPosix(
      "/workspace/project-1",
      ".t3team",
      "child-session-worktrees",
      "pingdotgg-t3code",
      `release-7-0-${structured.project_session_id.slice(0, 8).toLowerCase()}`,
    );

    expect(result).toEqual(
      expect.objectContaining({
        structuredContent: expect.objectContaining({
          ok: true,
          name: "Review repo child",
          execution_scope: "repository",
          started: false,
          repo_full_name: "pingdotgg/t3code",
          repo_ref: "release/7.0",
          branch: "feature/review-repo-child-1a2b3c4d",
          worktree_path: expectedWorktreePath,
          setup_script_status: "no-script",
        }),
      }),
    );

    expect(createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/linked/pingdotgg/t3code",
        refName: "release/7.0",
        path: expectedWorktreePath,
      }),
    );
    expect(makeDirectory).toHaveBeenCalledWith(
      dirnamePosix(expectedWorktreePath),
      expect.objectContaining({ recursive: true }),
    );
    expect(dispatch.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            type: "thread.create",
            title: "Review repo child",
            branch: "feature/review-repo-child-1a2b3c4d",
            worktreePath: expectedWorktreePath,
          }),
        ],
        [
          expect.objectContaining({
            type: "thread.activity.append",
            activity: expect.objectContaining({
              kind: "t3team.handoff.created",
              payload: expect.objectContaining({
                repoFullName: "pingdotgg/t3code",
                repoRef: "release/7.0",
                branch: "feature/review-repo-child-1a2b3c4d",
                worktreePath: expectedWorktreePath,
              }),
            }),
          }),
        ],
      ]),
    );
  });
});
