import * as NodeServices from "@effect/platform-node/NodeServices";
import { type OrchestrationProjectShell, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ProjectMachineDiscovery from "./t3team-ProjectMachineDiscovery.ts";

const projectId = ProjectId.make("project-1");

const writeTree = Effect.fn("writeTree")(function* (root: string, files: Record<string, string>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    yield* fileSystem.makeDirectory(path.dirname(absolute), { recursive: true });
    yield* fileSystem.writeFileString(absolute, contents);
  }
});

/** Runs discovery for a project whose workspace is a fresh temp directory seeded by `seed`. */
const discoverIn = (
  seed: (root: string) => Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-machine-project-" });
    yield* seed(root);
    const projections = Layer.mock(ProjectionSnapshotQuery)({
      getProjectShellById: (id) =>
        Effect.succeed(
          id === projectId
            ? Option.some({ workspaceRoot: root } as unknown as OrchestrationProjectShell)
            : Option.none(),
        ),
    });
    return yield* Effect.gen(function* () {
      const discovery = yield* ProjectMachineDiscovery.ProjectMachineDiscovery;
      return yield* discovery.discover(projectId);
    }).pipe(Effect.provide(ProjectMachineDiscovery.layer.pipe(Layer.provide(projections))));
  });

it.layer(NodeServices.layer)("ProjectMachineDiscovery", (it) => {
  describe("discover", () => {
    it.effect("is None for a workspace with no repository", () =>
      Effect.gen(function* () {
        const result = yield* discoverIn((root) =>
          writeTree(root, { ".devcontainer/devcontainer.json": `{ "image": "node:22" }` }),
        );
        expect(result).toEqual({ status: { _tag: "None" }, candidates: [], rejected: [] });
      }),
    );

    it.effect(
      "defaults to a linked repository's pointer over the project's plain devcontainer",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const result = yield* discoverIn((root) => {
            const api = path.join(root, ".t3team/references/01-api");
            const broken = path.join(root, ".t3team/references/02-web");
            return Effect.gen(function* () {
              yield* writeTree(root, {
                ".git/HEAD": "ref: refs/heads/main\n",
                ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
                ".t3team/references/reference-repositories.json": `{ "linkedRepositories": [
                { "url": "https://github.com/acme/api.git", "localPath": "${api}", "status": "cloned" },
                { "url": "https://github.com/acme/web.git", "localPath": "${broken}", "status": "failed" }
              ] }`,
              });
              yield* writeTree(api, {
                ".nexi/machine.json": `{ "version": 1, "devcontainer": ".devcontainer/devcontainer.json" }`,
                ".devcontainer/devcontainer.json": `{ "image": "node:24" }`,
              });
              yield* writeTree(broken, { ".devcontainer/devcontainer.json": `{ "image": "x" }` });
            });
          });
          expect(result.candidates.map((c) => [c.repository, c.machineFilePath])).toEqual([
            ["acme/api", ".nexi/machine.json"],
            [".", null],
          ]);
          expect(result.status).toMatchObject({
            _tag: "Detected",
            definition: { repository: "acme/api" },
          });
        }),
    );

    it.effect("fails with unknown_project for a project this environment does not hold", () =>
      Effect.gen(function* () {
        const projections = Layer.mock(ProjectionSnapshotQuery)({
          getProjectShellById: () => Effect.succeed(Option.none()),
        });
        const error = yield* Effect.gen(function* () {
          const discovery = yield* ProjectMachineDiscovery.ProjectMachineDiscovery;
          return yield* discovery.discover(projectId);
        }).pipe(
          Effect.provide(ProjectMachineDiscovery.layer.pipe(Layer.provide(projections))),
          Effect.flip,
        );
        expect(error.reason).toBe("unknown_project");
      }),
    );
  });
});
