// @effect-diagnostics nodeBuiltinImport:off - reads a workflow fixture and uses a temp runs root.
/**
 * `ctx.store` / `ctx.changeRequests` as a recipe script sees them. The context is built by the
 * real `T3TeamScriptHost` layer over the real pack document store (in-memory SQLite) and a fake
 * `PullRequestService`; the script test drives a real run through `launchWorkflowRecipe`, so the
 * launch input → run options → `ScriptHandlerCtx` passthrough is covered as well.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import {
  ProjectId,
  ProviderInstanceId,
  type PullRequestDetail,
  type PullRequestDiffInput,
  type PullRequestRef,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { defineCollections } from "@t3team/pack-api";
import {
  ChangeRequestScopeError,
  defineScript,
  type ChangeRequestDiffPage,
  type ScriptHandlerCtx,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { afterAll, beforeAll } from "vite-plus/test";

import { layerMemory } from "./persistence/Sqlite.ts";
import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import {
  getPackRecipeSources,
  setPackRecipeSources,
  type PackRecipeSource,
} from "./t3team-packRecipeSources.ts";
import * as ScriptHost from "./t3team-scriptHostContext.ts";
import * as Store from "./t3team-v2/t3team-packDocumentStore.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const projectId = ProjectId.make("project-1");
const recipeRoot = (pack: string) => `/packs/${pack}/recipes/inspect`;
const source = (packId: string): PackRecipeSource => ({
  packId,
  packVersion: "1.0.0",
  packScope: "distribution",
  declaredId: "inspect",
  recipeRoot: recipeRoot(packId),
});
const READ = ["integration.read"];

const file = (name: string) =>
  `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-old\n+new\n`;
const slices: Record<string, { patch: string; nextCursor: string | null }> = {
  first: { patch: ["a.ts", "b.ts", "c.ts"].map(file).join(""), nextCursor: "slice-2" },
  "slice-2": { patch: ["d.ts", "e.ts"].map(file).join(""), nextCursor: null },
};

/** Records what reached the provider, so a refusal can be proven to have asked nothing. */
const providerCalls: Array<{ readonly method: string; readonly input: unknown }> = [];
const fakePullRequests = PullRequestService.of({
  projectRepositories: () =>
    Effect.succeed([
      { host: "github.com", repository: "acme/app" },
      { host: "github.com", repository: "acme/linked" },
    ]),
  detail: (input: PullRequestRef) => {
    providerCalls.push({ method: "detail", input });
    return Effect.succeed({
      provider: "github",
      repository: input.repository,
      number: input.number,
      title: "Add the thing",
      body: "Body",
      url: `https://github.com/${input.repository}/pull/${input.number}`,
      state: "open",
      isDraft: false,
      author: { login: "octo", name: "Octo Cat", avatarUrl: null },
      headBranch: "feature",
      headSha: "abc123",
      headRepositoryNameWithOwner: "fork/app",
      baseBranch: "main",
      additions: 5,
      deletions: 5,
      changedFiles: 5,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      mergedAt: null,
      closedAt: null,
    } as unknown as PullRequestDetail);
  },
  diff: (input: PullRequestDiffInput) => {
    providerCalls.push({ method: "diff", input });
    return Effect.succeed({ ...slices[input.cursor ?? "first"]!, truncated: false });
  },
} as unknown as PullRequestService["Service"]);

const collections = new Map([
  [
    "pack-a",
    defineCollections({ items: { maxDocBytes: 4096, retention: "keep" }, quotaBytes: 65536 }),
  ],
  [
    "pack-b",
    defineCollections({ items: { maxDocBytes: 4096, retention: "keep" }, quotaBytes: 65536 }),
  ],
]);
const TestLayer = ScriptHost.layer.pipe(
  Layer.provide(Layer.succeed(PullRequestService, fakePullRequests)),
  Layer.provideMerge(Store.layer),
  Layer.provide(Layer.succeed(Store.PackDocumentCollections, collections)),
  Layer.provide(layerMemory),
);

const previousSources = getPackRecipeSources();
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-script-host-"));
beforeAll(() =>
  setPackRecipeSources({ sources: ["pack-a", "pack-b", "pack-c"].map(source), diagnostics: [] }),
);
afterAll(() => {
  setPackRecipeSources(previousSources);
  NodeFS.rmSync(runsRoot, { recursive: true, force: true });
});

const forRun = (pack: string | undefined, toolGroups: ReadonlyArray<string> | undefined) =>
  Effect.gen(function* () {
    const host = yield* ScriptHost.T3TeamScriptHost;
    return host.forRun({
      projectId,
      recipePath: pack === undefined ? "/repo/.t3team/recipes/local" : recipeRoot(pack),
      toolGroups,
    });
  });

/** Every page of a diff, following `next`. */
async function allPages(ctx: Pick<ScriptHandlerCtx, "changeRequests">, pageSize: number) {
  const pages: ChangeRequestDiffPage[] = [];
  let cursor: string | undefined;
  do {
    const page = await ctx.changeRequests!.diff(
      { repository: "acme/linked", number: 7 },
      { pageSize, ...(cursor === undefined ? {} : { cursor }) },
    );
    pages.push(page);
    cursor = page.next;
  } while (cursor !== undefined);
  return pages;
}

const inspect = defineScript({
  inputs: Schema.Struct({ repository: Schema.String, number: Schema.Number }),
  outputs: Schema.Unknown,
  handler: async (input, ctx) => {
    const detail = await ctx.changeRequests!.detail(input);
    const pages = await allPages(ctx, 2);
    const stored = await ctx.store!.insertOrGet("items", `cr/${input.number}`, {
      title: detail.title,
      files: pages.reduce((sum, page) => sum + page.fileCount, 0),
    });
    return { detail, pageFileCounts: pages.map((page) => page.fileCount), stored: stored.doc };
  },
});

it.layer(TestLayer)("script host context", (it) => {
  it.effect("a script reads detail, pages the diff, and writes its pack store", () =>
    Effect.gen(function* () {
      providerCalls.length = 0;
      const scriptHost = yield* forRun("pack-a", READ);
      const errors: unknown[] = [];
      const completed: unknown[] = [];
      const fixture = NodeURL.fileURLToPath(
        new URL("../__fixtures__/t3team-scriptHost.workflow.ts", import.meta.url),
      );
      const result = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId: "script-host-run",
          workflowPath: fixture,
          args: { repository: "ACME/Linked", number: 7 },
          scripts: { inspect },
          scriptHost,
          runsRoot,
          launchThreadId: undefined,
          projectId,
          modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
          runtimeMode: "full-access",
          interactionMode: "default",
          registry: makeWorkflowEngineRegistry(),
          host: makeFakeWorkflowHost().host,
          newId: () => "id",
          nowIso: () => "2026-10-07T00:00:00.000Z",
          onComplete: async (output) => void completed.push(output),
          onError: async (error) => void errors.push(error),
        }),
      );
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(result.status, "completed");
      assert.deepInclude(completed[0] as object, { pageFileCounts: [2, 1, 2] });
      const output = completed[0] as {
        detail: Record<string, unknown>;
        stored: { doc: unknown; version: number };
      };
      assert.deepInclude(output.detail, {
        host: "github.com",
        repository: "acme/linked",
        headSha: "abc123",
        headRepository: "fork/app",
        author: { login: "octo", name: "Octo Cat" },
      });
      assert.deepStrictEqual(output.stored.doc, { title: "Add the thing", files: 5 });
      // The provider saw the project's own spelling and host, and each slice's own cursor.
      assert.deepStrictEqual(
        providerCalls.map(({ method, input }) => [method, (input as { cursor?: string }).cursor]),
        [
          ["detail", undefined],
          ["diff", undefined],
          ["diff", undefined],
          ["diff", "slice-2"],
        ],
      );
      assert.deepInclude(providerCalls[0]!.input as object, {
        projectId,
        host: "github.com",
        repository: "acme/linked",
      });
    }),
  );

  it.effect("diff pages are whole files, bounded by page size, and rejoin the full patch", () =>
    Effect.gen(function* () {
      const host = yield* forRun(undefined, READ);
      const pages = yield* Effect.promise(() => allPages(host, 10));
      assert.deepStrictEqual(
        pages.map((page) => page.fileCount),
        [3, 2],
      );
      assert.strictEqual(pages[0]!.kind, "change-request-diff-page");
      assert.strictEqual(
        pages.map((page) => page.patch).join(""),
        slices.first!.patch + slices["slice-2"]!.patch,
      );
      const invalid = yield* Effect.promise(() =>
        host.changeRequests!.diff({ repository: "acme/app", number: 7 }, { cursor: "nope" }).then(
          () => null,
          (error: unknown) => error,
        ),
      );
      assert.instanceOf(invalid, RangeError);
    }),
  );

  it.effect(
    "refuses a repository that is not linked to the run's project, asking no provider",
    () =>
      Effect.gen(function* () {
        providerCalls.length = 0;
        const host = yield* forRun(undefined, READ);
        const refusals = yield* Effect.promise(() =>
          Promise.all(
            [
              host.changeRequests!.detail({ repository: "evil/repo", number: 1 }),
              host.changeRequests!.diff({ repository: "evil/repo", number: 1 }),
              // A known selector on another host is a different repository.
              host.changeRequests!.detail({
                repository: "acme/app",
                number: 1,
                host: "gitlab.com",
              }),
            ].map((call) =>
              call.then(
                () => null,
                (error: unknown) => error,
              ),
            ),
          ),
        );
        for (const refusal of refusals) {
          assert.instanceOf(refusal, ChangeRequestScopeError);
        }
        assert.strictEqual((refusals[0] as ChangeRequestScopeError).repository, "evil/repo");
        assert.deepStrictEqual(providerCalls, []);
      }),
  );

  it.effect("each pack sees only its own documents", () =>
    Effect.gen(function* () {
      const a = (yield* forRun("pack-a", undefined)).store!;
      const b = (yield* forRun("pack-b", undefined)).store!;
      yield* Effect.promise(() => a.put("items", "shared-key", { owner: "a" }));
      assert.isNull(yield* Effect.promise(() => b.get("items", "shared-key")));
      assert.deepStrictEqual(yield* Effect.promise(() => b.list("items")), []);
      yield* Effect.promise(() => b.put("items", "shared-key", { owner: "b" }));
      const fromA = yield* Effect.promise(() => a.get("items", "shared-key"));
      assert.deepStrictEqual(fromA?.doc, { owner: "a" });
    }),
  );

  it.effect("members are absent where the run is not entitled to them", () =>
    Effect.gen(function* () {
      // pack-c registers recipes but no persistence (no store:v1); a project recipe has no pack.
      assert.isUndefined((yield* forRun("pack-c", READ)).store);
      assert.isUndefined((yield* forRun(undefined, READ)).store);
      // Without `integration.read` in the recipe's declared groups there is no reader at all.
      assert.isUndefined((yield* forRun("pack-a", ["artifact.rw"])).changeRequests);
      assert.isUndefined((yield* forRun("pack-a", undefined)).changeRequests);
      const host = yield* ScriptHost.T3TeamScriptHost;
      assert.deepStrictEqual(
        host.forRun({ projectId, recipePath: undefined, toolGroups: undefined }),
        {},
      );
    }),
  );
});
