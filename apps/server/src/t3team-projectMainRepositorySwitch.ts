/**
 * Switching a project's main repository (flag `NEXI_FF_MAIN_REPOSITORY`): resolves the linked
 * clone that becomes the shared workspace, migrates the state dir into it (best-effort; the old
 * location is kept) and records the selection in its reference manifest. The caller persists the
 * result on the project record.
 *
 * `url: null` chooses the project's own workspace — the way back from a linked main repository,
 * and an explicit opt-out that auto-detection must respect.
 *
 * @module t3team-projectMainRepositorySwitch
 */
import type {
  OrchestrationProjectShell,
  ProjectMainRepository,
  ProjectMainRepositorySelection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import {
  ensureWorkspaceGitignore,
  writeReferenceManifest,
} from "./t3team-project-repository-services.ts";
import {
  mergeLinkedRepositoryEntries,
  readPreservedReferenceManifest,
} from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MAIN_REPOSITORY_GITIGNORE_ENTRIES,
  MANIFEST_FILE_NAME,
  isLinkedRepositoryReady,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import { migrateProjectStateDir } from "./t3team-projectMainRepositoryState.ts";
import { findLinkedRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";

export type ProjectMainRepositorySwitchResult = {
  readonly changed: boolean;
  readonly workspaceRoot: string;
  readonly mainRepository?: ProjectMainRepository;
  readonly migratedPaths: ReadonlyArray<string>;
};

const fail = (message: string) => Effect.fail(new T3TeamAtlassianError({ message }));

export const switchProjectMainRepository = Effect.fn("switchProjectMainRepository")(
  function* (input: {
    readonly project: Pick<OrchestrationProjectShell, "workspaceRoot" | "mainRepository">;
    readonly url: string | null;
    readonly selection: Extract<ProjectMainRepositorySelection, "user" | "detected">;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const current = input.project;
    const unchanged: ProjectMainRepositorySwitchResult = {
      changed: false,
      workspaceRoot: current.workspaceRoot,
      ...(current.mainRepository ? { mainRepository: current.mainRepository } : {}),
      migratedPaths: [],
    };
    // An explicit user choice always wins over detection.
    if (input.selection === "detected" && current.mainRepository?.selection === "user") {
      return unchanged;
    }

    const projectRoot = current.mainRepository?.projectRoot ?? current.workspaceRoot;
    const manifestPath = (root: string) =>
      path.join(root, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, MANIFEST_FILE_NAME);
    const source = yield* readPreservedReferenceManifest(manifestPath(current.workspaceRoot));

    let checkoutPath = projectRoot;
    if (input.url !== null) {
      const home = yield* readPreservedReferenceManifest(manifestPath(projectRoot));
      const linked =
        findLinkedRepository(source.linkedRepositories, input.url) ??
        findLinkedRepository(home.linkedRepositories, input.url);
      if (!linked || !isLinkedRepositoryReady(linked) || !linked.localPath) {
        return yield* fail(`Linked repository '${input.url}' has no ready local checkout.`);
      }
      const isClone = yield* fileSystem
        .exists(path.join(linked.localPath, ".git"))
        .pipe(Effect.orElseSucceed(() => false));
      if (!isClone) {
        return yield* fail(`Linked repository '${input.url}' is missing at '${linked.localPath}'.`);
      }
      checkoutPath = linked.localPath;
    }

    const mainRepository: ProjectMainRepository = {
      ...(input.url !== null ? { url: input.url } : {}),
      checkoutPath,
      projectRoot,
      selection: input.selection,
    };
    const migratedPaths = yield* migrateProjectStateDir({
      fromRoot: current.workspaceRoot,
      toRoot: checkoutPath,
    });
    // A linked checkout is a real repository: like an adopted one, only the machine-local state
    // subpaths are ignored, so committed team state stays committable.
    if (input.url !== null) {
      yield* ensureWorkspaceGitignore(checkoutPath, MAIN_REPOSITORY_GITIGNORE_ENTRIES);
    }

    // The target's manifest knows every linked clone, and names the checkout as the main
    // repository so worktree isolation defaults to it before the next bootstrap.
    const target = yield* readPreservedReferenceManifest(manifestPath(checkoutPath));
    const targetMain =
      input.url !== null
        ? { url: input.url, localPath: checkoutPath, status: input.selection }
        : target.mainRepository;
    yield* writeReferenceManifest(path.dirname(manifestPath(checkoutPath)), {
      workspaceRoot: checkoutPath,
      referencesRoot: path.dirname(manifestPath(checkoutPath)),
      workspaceRepositoryInitialized: false,
      linkedRepositories: mergeLinkedRepositoryEntries(
        target.linkedRepositories,
        source.linkedRepositories,
      ),
      ...(targetMain ? { mainRepository: targetMain } : {}),
      updatedAt: DateTime.formatIso(yield* DateTime.now),
    });

    return {
      changed: true,
      workspaceRoot: checkoutPath,
      mainRepository,
      migratedPaths,
    } satisfies ProjectMainRepositorySwitchResult;
  },
);
