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
import { migrateLegacyProjectStateDir } from "./t3team-projectLegacyStateMigration.ts";
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
    const manifest = `${REFERENCES_DIR_NAME}/${MANIFEST_FILE_NAME}`;

    it.effect("adopts only the reference manifest from a legacy .nexi", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({
          [`${LEGACY}/${manifest}`]: `{"linked":1}`,
          [`${LEGACY}/recipes/a/recipe.json`]: "{}",
        });
        expect(yield* ensureNexiProjectStateDir(workspaceRoot)).toEqual([manifest]);
        expect(yield* fileSystem.readFileString(path.join(workspaceRoot, NEW, manifest))).toBe(
          `{"linked":1}`,
        );
        // Shared state is read in place, not copied: a pull of .nexi can never be shadowed.
        expect(yield* fileSystem.exists(path.join(workspaceRoot, NEW, "recipes"))).toBe(false);
      }),
    );

    it.effect("never overwrites an existing new manifest", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({
          [`${LEGACY}/${manifest}`]: `{"from":"legacy"}`,
          [`${NEW}/${manifest}`]: `{"from":"new"}`,
        });
        expect(yield* ensureNexiProjectStateDir(workspaceRoot)).toEqual([]);
        expect(yield* fileSystem.readFileString(path.join(workspaceRoot, NEW, manifest))).toBe(
          `{"from":"new"}`,
        );
      }),
    );

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
  });

  describe("migrateLegacyProjectStateDir", () => {
    it.effect("moves legacy files, keeps conflicts and machine-local entries", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({
          [`${LEGACY}/recipes/a/recipe.json`]: "legacy a",
          [`${LEGACY}/recipes/b/recipe.json`]: "legacy b",
          [`${LEGACY}/machine.json`]: "legacy machine",
          [`${LEGACY}/child-session-worktrees/w/file`]: "worktree",
          [`${LEGACY}/references/clone/file`]: "clone",
          [`${NEW}/recipes/a/recipe.json`]: "new a",
        });
        const outcome = yield* migrateLegacyProjectStateDir(workspaceRoot);
        expect(outcome.status).toBe("migrated");
        expect([...outcome.moved].toSorted()).toEqual(["machine.json", "recipes/b/recipe.json"]);
        expect(outcome.conflicts).toEqual(["recipes/a/recipe.json"]);
        expect([...outcome.kept].toSorted()).toEqual([
          "child-session-worktrees",
          "references/clone",
        ]);
        const read = (relative: string) =>
          fileSystem.readFileString(path.join(workspaceRoot, relative));
        expect(yield* read(`${NEW}/recipes/a/recipe.json`)).toBe("new a");
        expect(yield* read(`${NEW}/recipes/b/recipe.json`)).toBe("legacy b");
        expect(yield* read(`${NEW}/machine.json`)).toBe("legacy machine");
        expect(yield* read(`${LEGACY}/recipes/a/recipe.json`)).toBe("legacy a");
        expect(yield* fileSystem.exists(path.join(workspaceRoot, LEGACY, "recipes/b"))).toBe(false);
        expect(yield* read(`${LEGACY}/references/clone/file`)).toBe("clone");
      }),
    );

    it.effect("removes the legacy dir once it is empty and is a no-op afterwards", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeWorkspace({ [`${LEGACY}/skills/s/SKILL.md`]: "skill" });
        expect((yield* migrateLegacyProjectStateDir(workspaceRoot)).status).toBe("migrated");
        expect(yield* fileSystem.exists(path.join(workspaceRoot, LEGACY))).toBe(false);
        expect((yield* migrateLegacyProjectStateDir(workspaceRoot)).status).toBe(
          "nothing-to-migrate",
        );
      }),
    );

    it.effect("refuses a legacy dir that is a symlink out of the workspace", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outside = yield* makeWorkspace({ "recipes/x/recipe.json": "outside" });
        const workspaceRoot = yield* makeWorkspace({});
        yield* fileSystem.symlink(outside, path.join(workspaceRoot, LEGACY));
        const outcome = yield* migrateLegacyProjectStateDir(workspaceRoot);
        expect(outcome.status).toBe("refused");
        expect(yield* fileSystem.exists(path.join(outside, "recipes/x/recipe.json"))).toBe(true);
      }),
    );

    it.effect("refuses to write through a symlinked .agents", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outside = yield* makeWorkspace({});
        const workspaceRoot = yield* makeWorkspace({ [`${LEGACY}/a.json`]: "a" });
        yield* fileSystem.symlink(outside, path.join(workspaceRoot, ".agents"));
        const outcome = yield* migrateLegacyProjectStateDir(workspaceRoot);
        expect(outcome.status).toBe("refused");
        expect(yield* fileSystem.exists(path.join(outside, "nexi"))).toBe(false);
        expect(yield* fileSystem.exists(path.join(workspaceRoot, LEGACY, "a.json"))).toBe(true);
      }),
    );

    it.effect("leaves a symlink inside the legacy dir where it is", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outside = yield* makeWorkspace({ "secret.txt": "outside" });
        const workspaceRoot = yield* makeWorkspace({ [`${LEGACY}/keep.json`]: "k" });
        yield* fileSystem.symlink(outside, path.join(workspaceRoot, LEGACY, "link"));
        const outcome = yield* migrateLegacyProjectStateDir(workspaceRoot);
        expect(outcome.moved).toEqual(["keep.json"]);
        expect(outcome.kept).toEqual(["link"]);
        expect(yield* fileSystem.exists(path.join(outside, "secret.txt"))).toBe(true);
        expect(yield* fileSystem.exists(path.join(workspaceRoot, NEW, "link"))).toBe(false);
      }),
    );
  });
});
