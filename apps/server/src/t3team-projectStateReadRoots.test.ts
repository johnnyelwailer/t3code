import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  readMachineSource,
  writeMachineSource,
} from "./project/t3team-projectMachineSourceSetting.ts";
import { MANIFEST_FILE_NAME, REFERENCES_DIR_NAME } from "./t3team-project-repository-utils.ts";
import { ensureNexiProjectStateDir } from "./t3team-projectMainRepositoryState.ts";
import { readPreservedReferenceManifest } from "./t3team-project-repository-routesBootstrap.ts";
import { projectStateDirIsContained } from "./t3team-projectStateContainment.ts";
import { resolveProjectStateReadPath } from "./t3team-projectStateReadRoots.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { readRecipeTriggerSettings } from "./t3team-recipeTriggerSettings.ts";

const NEW = ".agents/nexi";
const LEGACY = ".nexi";

const makeWorkspace = Effect.fn("makeWorkspace")(function* (files: Record<string, string>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-state-roots-" });
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    yield* fileSystem.makeDirectory(path.dirname(absolute), { recursive: true });
    yield* fileSystem.writeFileString(absolute, contents);
  }
  return yield* fileSystem.realPath(root);
});

const recipe = (id: string, title: string) => ({
  [`recipes/${id}/recipe.json`]: JSON.stringify({
    id,
    version: "0.1.0",
    scope: "project",
    displayName: title,
    shortDescription: title,
    surfaces: ["project.dashboard.backlog"],
    prompt: "./prompt.md",
  }),
  [`recipes/${id}/prompt.md`]: "Do it.",
});
const under = (dir: string, files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).map(([name, text]) => [`${dir}/${name}`, text]));

it.layer(NodeServices.layer)("project state is read from both dirs", (it) => {
  describe("recipes", () => {
    it.effect("lists recipes that only the legacy .nexi holds", () =>
      Effect.gen(function* () {
        const workspaceRoot = yield* makeWorkspace(under(LEGACY, recipe("old", "Old recipe")));
        const result = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(result.recipes.map((entry) => entry.id)).toEqual(["old"]);
        expect(result.recipes[0]?.recipePath).toContain(`/${LEGACY}/recipes/old`);
      }),
    );

    it.effect("lists recipes from both dirs, the new one first-class", () =>
      Effect.gen(function* () {
        const workspaceRoot = yield* makeWorkspace({
          ...under(LEGACY, recipe("old", "Old recipe")),
          ...under(NEW, recipe("fresh", "Fresh recipe")),
        });
        const result = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(result.recipes.map((entry) => entry.id)).toEqual(["fresh", "old"]);
      }),
    );

    it.effect("on a conflict the new dir wins and the legacy copy is never loaded", () =>
      Effect.gen(function* () {
        const workspaceRoot = yield* makeWorkspace({
          ...under(LEGACY, recipe("same", "Legacy title")),
          ...under(NEW, recipe("same", "New title")),
        });
        const result = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(result.recipes).toHaveLength(1);
        expect(result.recipes[0]).toMatchObject({ id: "same", title: "New title" });
        expect(result.recipes[0]?.recipePath).toContain(`/${NEW}/recipes/same`);
      }),
    );
  });

  describe("single files", () => {
    it.effect("resolves to the newest existing copy, else to the write location", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const both = yield* makeWorkspace({
          [`${NEW}/setup/profile.json`]: "{}",
          [`${LEGACY}/setup/profile.json`]: "{}",
        });
        const legacyOnly = yield* makeWorkspace({ [`${LEGACY}/setup/profile.json`]: "{}" });
        const none = yield* makeWorkspace({});
        const relative = `${NEW}/setup/profile.json`;
        expect(yield* resolveProjectStateReadPath(both, relative)).toBe(path.join(both, relative));
        expect(yield* resolveProjectStateReadPath(legacyOnly, relative)).toBe(
          path.join(legacyOnly, LEGACY, "setup/profile.json"),
        );
        expect(yield* resolveProjectStateReadPath(none, relative)).toBe(path.join(none, relative));
        // A path outside the state dir has one candidate, unchanged.
        expect(yield* resolveProjectStateReadPath(none, "AGENTS.md")).toBe(
          path.join(none, "AGENTS.md"),
        );
      }),
    );

    const doc = (enabled: boolean) => JSON.stringify({ version: 1, triggers: { t: { enabled } } });

    it.effect("reads trigger settings from the legacy dir, and the new one wins", () =>
      Effect.gen(function* () {
        const legacyOnly = yield* makeWorkspace({ [`${LEGACY}/recipe-triggers.json`]: doc(true) });
        expect(yield* readRecipeTriggerSettings({ workspaceRoot: legacyOnly })).toEqual({
          t: { enabled: true },
        });
        const both = yield* makeWorkspace({
          [`${LEGACY}/recipe-triggers.json`]: doc(true),
          [`${NEW}/recipe-triggers.json`]: doc(false),
        });
        expect(yield* readRecipeTriggerSettings({ workspaceRoot: both })).toEqual({
          t: { enabled: false },
        });
      }),
    );

    it.effect("reads the machine source from the legacy dir; a reset removes both copies", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const source = JSON.stringify({ version: 1, branch: "main" });
        const workspaceRoot = yield* makeWorkspace({
          [`${LEGACY}/machine-source.json`]: source,
          [`${NEW}/machine-source.json`]: JSON.stringify({ version: 1, branch: "next" }),
        });
        expect(yield* readMachineSource(workspaceRoot)).toEqual({ branch: "next" });
        yield* writeMachineSource(workspaceRoot, null);
        expect(yield* readMachineSource(workspaceRoot)).toBeNull();
        expect(
          yield* fileSystem.exists(path.join(workspaceRoot, LEGACY, "machine-source.json")),
        ).toBe(false);
        yield* writeMachineSource(workspaceRoot, { branch: "x" });
        expect(yield* fileSystem.exists(path.join(workspaceRoot, NEW, "machine-source.json"))).toBe(
          true,
        );
        expect(
          yield* fileSystem.exists(path.join(workspaceRoot, LEGACY, "machine-source.json")),
        ).toBe(false);
      }),
    );
  });

  describe("ensureNexiProjectStateDir", () => {
    it.effect("copies a .t3team forward only when neither .nexi nor .agents/nexi exists", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fresh = yield* makeWorkspace({ ".t3team/recipes/a/recipe.json": "{}" });
        expect((yield* ensureNexiProjectStateDir(fresh)).length).toBeGreaterThan(0);
        expect(yield* fileSystem.exists(path.join(fresh, NEW, "recipes/a/recipe.json"))).toBe(true);
        const migratedBefore = yield* makeWorkspace({
          ".t3team/recipes/a/recipe.json": "{}",
          [`${LEGACY}/recipes/b/recipe.json`]: "{}",
        });
        expect(yield* ensureNexiProjectStateDir(migratedBefore)).toEqual([]);
        expect(yield* fileSystem.exists(path.join(migratedBefore, NEW))).toBe(false);
      }),
    );

    it.effect("never copies a legacy .nexi: it is read in place", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({ [`${LEGACY}/recipes/a/recipe.json`]: "{}" });
        expect(yield* ensureNexiProjectStateDir(workspaceRoot)).toEqual([]);
        expect(yield* fileSystem.exists(path.join(workspaceRoot, NEW))).toBe(false);
      }),
    );
  });

  describe("recipes shadowed in the agent list", () => {
    it.effect("reports a legacy recipe the new dir shadows, like discovery does", () =>
      Effect.gen(function* () {
        const workspaceRoot = yield* makeWorkspace({
          ...under(LEGACY, recipe("same", "Legacy title")),
          ...under(NEW, recipe("same", "New title")),
        });
        const result = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(result.diagnostics).toEqual([
          expect.stringContaining("/.nexi/recipes/same is shadowed by the same recipe in a newer"),
        ]);
      }),
    );
  });

  describe("the reference manifest", () => {
    const manifest = `${REFERENCES_DIR_NAME}/${MANIFEST_FILE_NAME}`;
    const body = JSON.stringify({ linkedRepositories: [{ url: "https://h/o/r" }] });

    it.effect("is read from the legacy dir in place, never copied or rewritten", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({ [`${LEGACY}/${manifest}`]: body });
        const read = yield* readPreservedReferenceManifest(path.join(workspaceRoot, NEW, manifest));
        expect(read.linkedRepositories.map((entry) => entry.url)).toEqual(["https://h/o/r"]);
        expect(yield* fileSystem.exists(path.join(workspaceRoot, NEW))).toBe(false);
        expect(yield* fileSystem.readFileString(path.join(workspaceRoot, LEGACY, manifest))).toBe(
          body,
        );
      }),
    );

    it.effect("the new manifest wins over the legacy one", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({
          [`${LEGACY}/${manifest}`]: body,
          [`${NEW}/${manifest}`]: JSON.stringify({
            linkedRepositories: [{ url: "https://h/o/new" }],
          }),
        });
        const read = yield* readPreservedReferenceManifest(path.join(workspaceRoot, NEW, manifest));
        expect(read.linkedRepositories.map((entry) => entry.url)).toEqual(["https://h/o/new"]);
      }),
    );
  });

  describe("writers refuse a state dir that is a symlink", () => {
    const linkInto = Effect.fn("linkInto")(function* (
      kind: "outside" | "in-workspace-claude" | "git",
    ) {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const outside = yield* makeWorkspace({});
      const workspaceRoot = yield* makeWorkspace({ ".claude/keep": "k", ".git/keep": "k" });
      const target =
        kind === "outside"
          ? outside
          : path.join(workspaceRoot, kind === "git" ? ".git" : ".claude");
      yield* fileSystem.symlink(target, path.join(workspaceRoot, ".agents"));
      return { workspaceRoot, target, outside };
    });

    const kinds = ["outside", "in-workspace-claude", "git"] as const;

    it.effect.each(kinds)(
      "machine source is not written through a symlinked .agents (%s)",
      (kind) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const { workspaceRoot, target } = yield* linkInto(kind);
          const outcome = yield* Effect.result(writeMachineSource(workspaceRoot, { branch: "x" }));
          expect(outcome._tag).toBe("Failure");
          expect(yield* fileSystem.exists(path.join(target, "nexi"))).toBe(false);
        }),
    );

    it.effect.each(kinds)(
      "ensureNexiProjectStateDir copies nothing through a symlinked .agents (%s)",
      (kind) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const { workspaceRoot, target } = yield* linkInto(kind);
          yield* fileSystem.makeDirectory(path.join(workspaceRoot, ".t3team/recipes"), {
            recursive: true,
          });
          yield* fileSystem.writeFileString(path.join(workspaceRoot, ".t3team/recipes/a"), "x");
          expect(yield* ensureNexiProjectStateDir(workspaceRoot)).toEqual([]);
          expect(yield* fileSystem.exists(path.join(target, "nexi"))).toBe(false);
        }),
    );

    it.effect("a symlinked .agents/nexi (not .agents) is refused too, a real chain is fine", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const real = yield* makeWorkspace({ ".agents/nexi/x": "x" });
        expect(yield* projectStateDirIsContained(real)).toBe(true);
        expect(yield* projectStateDirIsContained(yield* makeWorkspace({}))).toBe(true);
        const linked = yield* makeWorkspace({ ".agents/keep": "k", ".git/keep": "k" });
        yield* fileSystem.symlink(path.join(linked, ".git"), path.join(linked, ".agents/nexi"));
        expect(yield* projectStateDirIsContained(linked)).toBe(false);
      }),
    );
  });
});
