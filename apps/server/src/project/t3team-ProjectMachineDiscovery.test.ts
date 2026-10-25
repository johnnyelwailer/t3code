import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { ProjectService } from "./ProjectService.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "../t3team-project-repository-utils.ts";
import * as ProjectMachineDiscovery from "./t3team-ProjectMachineDiscovery.ts";

const projectId = ProjectId.make("project-1");
// The state dir name follows the NEXI_STATE_DIR flag (`.nexi` by default), so derive every path.
const references = `${HIDDEN_T3TEAM_DIR}/${REFERENCES_DIR_NAME}`;
const manifest = `${references}/${MANIFEST_FILE_NAME}`;

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
    const projects = Layer.mock(ProjectService)({
      getById: (id) =>
        Effect.succeed(
          id === projectId
            ? Option.some({
                id: projectId,
                workspaceRoot: root,
                title: "Test",
                defaultModelSelection: null,
                scripts: [],
                createdAt: "2026-10-24T00:00:00Z",
                updatedAt: "2026-10-24T00:00:00Z",
                deletedAt: null,
              })
            : Option.none(),
        ),
    });
    return yield* Effect.gen(function* () {
      const discovery = yield* ProjectMachineDiscovery.ProjectMachineDiscovery;
      return yield* discovery.discover(projectId);
    }).pipe(
      Effect.provide(
        ProjectMachineDiscovery.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              projects,
              Layer.mock(PullRequestProviderRegistry)({ get: () => null, kinds: [] }),
              Layer.mock(VcsProcess.VcsProcess)({}),
            ),
          ),
        ),
      ),
    );
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
      "defaults to the project's own devcontainer, listing a linked repository's pointer after it",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const result = yield* discoverIn((root) => {
            const api = path.join(root, references, "01-api");
            const broken = path.join(root, references, "02-web");
            return Effect.gen(function* () {
              yield* writeTree(root, {
                ".git/HEAD": "ref: refs/heads/main\n",
                ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
                [manifest]: `{ "linkedRepositories": [
                { "url": "https://github.com/acme/api.git", "localPath": ${JSON.stringify(api)}, "status": "cloned" },
                { "url": "https://github.com/acme/web.git", "localPath": ${JSON.stringify(broken)}, "status": "failed" }
              ] }`,
              });
              yield* writeTree(api, {
                ".git/HEAD": "ref: refs/heads/main\n",
                ".nexi/machine.json": `{ "version": 1, "devcontainer": ".devcontainer/devcontainer.json" }`,
                ".devcontainer/devcontainer.json": `{ "image": "node:24" }`,
              });
              yield* writeTree(broken, { ".devcontainer/devcontainer.json": `{ "image": "x" }` });
            });
          });
          expect(result.candidates.map((c) => [c.repository, c.machineFilePath])).toEqual([
            [".", null],
            ["acme/api", ".nexi/machine.json"],
          ]);
          expect(result.status).toMatchObject({
            _tag: "Detected",
            definition: { repository: "." },
          });
        }),
    );

    const linkedOnly = (...definitions: ReadonlyArray<readonly [string, Record<string, string>]>) =>
      discoverIn((root) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const entries = definitions.map(([name, files]) => {
            const localPath = path.join(root, references, name);
            return { name, files, localPath };
          });
          yield* writeTree(root, {
            ".git/HEAD": "ref: refs/heads/main\n",
            [manifest]: JSON.stringify({
              linkedRepositories: entries.map(({ name, localPath }) => ({
                url: `https://github.com/acme/${name}.git`,
                localPath,
                status: "cloned",
              })),
            }),
          });
          for (const { files, localPath } of entries) {
            yield* writeTree(localPath, { ".git/HEAD": "ref: refs/heads/main\n", ...files });
          }
        }),
      );
    const MACHINE = {
      ".nexi/machine.json": `{ "version": 1, "devcontainer": ".devcontainer/devcontainer.json" }`,
      ".devcontainer/devcontainer.json": `{ "image": "node:24" }`,
    };

    it.effect("reports linked machines without making one the project's default", () =>
      Effect.gen(function* () {
        const result = yield* linkedOnly(["api", MACHINE], ["web", MACHINE]);
        expect(result.candidates.map((c) => c.repository)).toEqual(["acme/api", "acme/web"]);
        expect(result.status._tag).toBe("None");
        expect(result.status._tag === "None" ? result.status.reason : "").toContain(
          "acme/api, acme/web define machines that this project does not use",
        );
      }),
    );

    it.effect("lists linked candidates by name whatever order they were linked in", () =>
      Effect.gen(function* () {
        const forward = yield* linkedOnly(["api", MACHINE], ["web", MACHINE]);
        const reverse = yield* linkedOnly(["web", MACHINE], ["api", MACHINE]);
        expect(reverse.candidates.map((c) => c.repository)).toEqual(
          forward.candidates.map((c) => c.repository),
        );
      }),
    );

    it.effect(
      "keeps a linked repository's broken definition from becoming the project's problem",
      () =>
        Effect.gen(function* () {
          const result = yield* linkedOnly([
            "api",
            { ".nexi/machine.json": `{ "version": 2 }`, ".devcontainer/devcontainer.json": "{}" },
          ]);
          expect(result.rejected).toEqual([]);
          expect(result.status._tag).toBe("None");
        }),
    );

    it.effect("skips malformed manifest entries instead of failing the whole discovery", () =>
      Effect.gen(function* () {
        const result = yield* discoverIn((root) =>
          writeTree(root, {
            ".git/HEAD": "ref: refs/heads/main\n",
            ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
            [manifest]: `{ "linkedRepositories": [
              {}, { "localPath": "/elsewhere" }, null, "x"
            ] }`,
          }),
        );
        expect(result.candidates.map((c) => c.repository)).toEqual(["."]);
      }),
    );

    it.effect("fails with unknown_project for a project this environment does not hold", () =>
      Effect.gen(function* () {
        const projects = Layer.mock(ProjectService)({
          getById: () => Effect.succeed(Option.none()),
        });
        const error = yield* Effect.gen(function* () {
          const discovery = yield* ProjectMachineDiscovery.ProjectMachineDiscovery;
          return yield* discovery.discover(projectId);
        }).pipe(
          Effect.provide(
            ProjectMachineDiscovery.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  projects,
                  Layer.mock(PullRequestProviderRegistry)({ get: () => null, kinds: [] }),
                  Layer.mock(VcsProcess.VcsProcess)({}),
                ),
              ),
            ),
          ),
          Effect.flip,
        );
        expect(error.reason).toBe("unknown_project");
      }),
    );
  });
});
