// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  addBranch,
  currentBranch,
  git,
  makeHarness,
  makeOrigin,
  settleAll,
} from "./t3team-linkedRepositorySync.fixtures.ts";
import { bootstrapWorkspaceReferences } from "./t3team-project-repository-routesReferences.ts";
import { listLinkedRepositoryBranches } from "./t3team-project-repository-routesBranches.ts";
import { readLinkedRepositoryStatus } from "./t3team-project-repository-routesStatus.ts";
import { HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME } from "./t3team-project-repository-utils.ts";

const cloneWorkspaceFrom = (origin: string, workspaceRoot: string) => {
  NodeFS.rmSync(workspaceRoot, { recursive: true, force: true });
  git(NodePath.dirname(workspaceRoot), "clone", "-q", origin, workspaceRoot);
};

describe("main repository branch selection", () => {
  it.live("does not wrap the main repository as a reference clone", () => {
    const harness = makeHarness();
    const mainOrigin = makeOrigin(harness.root, "main-origin");
    const secondary = makeOrigin(harness.root, "secondary");
    cloneWorkspaceFrom(mainOrigin, harness.workspaceRoot);
    return Effect.gen(function* () {
      const response = yield* bootstrapWorkspaceReferences({
        workspaceRoot: harness.workspaceRoot,
        workspaceRepositoryInitialized: true,
        detectedMainRepository: {
          url: mainOrigin,
          localPath: harness.workspaceRoot,
          status: "adopted",
        },
        linkedRepositoryUrls: [mainOrigin, secondary],
        syncLinkedRepositoryUrls: [secondary],
      });
      expect(response.linkedRepositories.map((entry) => entry.url)).toEqual([secondary]);
      const referencesRoot = NodePath.join(
        harness.workspaceRoot,
        HIDDEN_T3TEAM_DIR,
        REFERENCES_DIR_NAME,
      );
      const wrapped = NodeFS.existsSync(referencesRoot)
        ? NodeFS.readdirSync(referencesRoot).filter((name) =>
            NodeFS.existsSync(NodePath.join(referencesRoot, name, ".git")),
          )
        : [];
      expect(wrapped).toHaveLength(0);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live(
    "lists branches and checks out the chosen branch on the main workspace, not a second clone",
    () => {
      const harness = makeHarness();
      const mainOrigin = makeOrigin(harness.root, "main-origin");
      addBranch(mainOrigin, "feature/pj", { "skill.txt": "from the branch\n" });
      const secondary = makeOrigin(harness.root, "secondary");
      addBranch(secondary, "feature/other", { "other.txt": "x\n" });
      cloneWorkspaceFrom(mainOrigin, harness.workspaceRoot);
      expect(currentBranch(harness.workspaceRoot)).toBe("main");
      return Effect.gen(function* () {
        const response = yield* bootstrapWorkspaceReferences({
          workspaceRoot: harness.workspaceRoot,
          workspaceRepositoryInitialized: true,
          detectedMainRepository: {
            url: mainOrigin,
            localPath: harness.workspaceRoot,
            status: "adopted",
          },
          linkedRepositoryUrls: [mainOrigin, secondary],
          linkedRepositoryBranches: {
            [mainOrigin]: "feature/pj",
            [secondary]: "feature/other",
          },
          syncLinkedRepositoryUrls: [secondary],
        });
        expect(response.mainRepository?.branch).toBe("feature/pj");
        expect(response.mainRepository?.error).toBeUndefined();
        expect(currentBranch(harness.workspaceRoot)).toBe("feature/pj");
        expect(NodeFS.readFileSync(NodePath.join(harness.workspaceRoot, "skill.txt"), "utf8")).toBe(
          "from the branch\n",
        );

        const listed = yield* listLinkedRepositoryBranches(harness.workspaceRoot, mainOrigin);
        expect(listed.branches).toEqual(["feature/pj", "main"]);
        expect(listed.current).toBe("feature/pj");
        expect(listed.defaultBranch).toBe("main");

        const status = yield* readLinkedRepositoryStatus(harness.workspaceRoot);
        const mainEntry = status.linkedRepositories.find((entry) => entry.url === mainOrigin);
        expect(mainEntry?.localPath).toBe(harness.workspaceRoot);
        expect(mainEntry?.branch).toBe("feature/pj");
        expect(mainEntry?.status).toBe("cloned");

        expect(response.linkedRepositories).toHaveLength(1);
        yield* settleAll([response.linkedRepositories[0]!.localPath]);
        expect(currentBranch(response.linkedRepositories[0]!.localPath)).toBe("feature/other");

        const unknown = yield* listLinkedRepositoryBranches(
          harness.workspaceRoot,
          "https://example.com/x/y",
        );
        expect(unknown.branches).toEqual([]);
      }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
    },
  );

  it.live("leaves the workspace on its current branch when none is chosen", () => {
    const harness = makeHarness();
    const mainOrigin = makeOrigin(harness.root, "main-origin");
    addBranch(mainOrigin, "feature/pj", { "skill.txt": "from the branch\n" });
    cloneWorkspaceFrom(mainOrigin, harness.workspaceRoot);
    return Effect.gen(function* () {
      yield* bootstrapWorkspaceReferences({
        workspaceRoot: harness.workspaceRoot,
        workspaceRepositoryInitialized: true,
        detectedMainRepository: {
          url: mainOrigin,
          localPath: harness.workspaceRoot,
          status: "adopted",
        },
        linkedRepositoryUrls: [mainOrigin],
        linkedRepositoryBranches: {},
      });
      expect(currentBranch(harness.workspaceRoot)).toBe("main");
      const listed = yield* listLinkedRepositoryBranches(harness.workspaceRoot, mainOrigin);
      expect(listed.current).toBe("main");
      expect(listed.branches).toContain("feature/pj");
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("keeps a recorded main branch when a later save only mentions a secondary repo", () => {
    const harness = makeHarness();
    const mainOrigin = makeOrigin(harness.root, "main-origin");
    addBranch(mainOrigin, "feature/pj", { "skill.txt": "from the branch\n" });
    const secondary = makeOrigin(harness.root, "secondary");
    cloneWorkspaceFrom(mainOrigin, harness.workspaceRoot);
    return Effect.gen(function* () {
      yield* bootstrapWorkspaceReferences({
        workspaceRoot: harness.workspaceRoot,
        workspaceRepositoryInitialized: true,
        detectedMainRepository: {
          url: mainOrigin,
          localPath: harness.workspaceRoot,
          status: "adopted",
        },
        linkedRepositoryUrls: [mainOrigin, secondary],
        linkedRepositoryBranches: { [mainOrigin]: "feature/pj" },
        syncLinkedRepositoryUrls: [secondary],
      });
      expect(currentBranch(harness.workspaceRoot)).toBe("feature/pj");
      const later = yield* bootstrapWorkspaceReferences({
        workspaceRoot: harness.workspaceRoot,
        workspaceRepositoryInitialized: true,
        detectedMainRepository: {
          url: mainOrigin,
          localPath: harness.workspaceRoot,
          status: "adopted",
        },
        linkedRepositoryUrls: [secondary],
        linkedRepositoryBranches: {},
        syncLinkedRepositoryUrls: [secondary],
      });
      expect(later.mainRepository?.branch).toBe("feature/pj");
      expect(currentBranch(harness.workspaceRoot)).toBe("feature/pj");
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });
});
