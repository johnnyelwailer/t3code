// @effect-diagnostics nodeBuiltinImport:off - temp workspaces stand in for project roots.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect } from "vite-plus/test";

import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import {
  repositoryContainsPullRequest,
  resolvePullRequestCheckoutRoot,
} from "./t3team-pullRequestCheckoutRoot.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const registry = (remoteUrl: string | null) =>
  ({
    resolveHandle: () =>
      Effect.succeed({
        provider: undefined,
        context: remoteUrl === null ? null : { remoteUrl },
      }),
  }) as unknown as SourceControlProviderRegistry["Service"];

const workspaceWith = (linkedRepositories: ReadonlyArray<object>) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pr-checkout-root-"));
  const references = NodePath.join(root, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  NodeFS.mkdirSync(references, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(references, MANIFEST_FILE_NAME),
    encodeJson({ linkedRepositories }),
  );
  return root;
};

const resolve = (input: { cwd: string; reference: string; remoteUrl?: string | null }) =>
  resolvePullRequestCheckoutRoot({
    operation: "test",
    cwd: input.cwd,
    reference: input.reference,
    sourceControlProviders: registry(input.remoteUrl ?? null),
  }).pipe(Effect.provide(NodeServices.layer));

describe("repositoryContainsPullRequest", () => {
  it("matches every provider's pull request URL against any spelling of the repository", () => {
    for (const [repository, pullRequest] of [
      ["https://github.com/acme/api.git", "https://github.com/acme/api/pull/4"],
      ["https://github.com/acme/api/", "https://github.com/acme/api/pull/4"],
      ["git@github.com:acme/api.git", "https://github.com/acme/api/pull/4"],
      ["https://gitlab.com/g/sub/api", "https://gitlab.com/g/sub/api/-/merge_requests/9"],
      [
        "https://dev.azure.com/org/proj/_git/api",
        "https://dev.azure.com/org/proj/_git/api/pullrequest/12",
      ],
    ] as const) {
      expect(repositoryContainsPullRequest(repository, pullRequest), pullRequest).toBe(true);
    }
  });

  it("does not confuse a repository with one that shares its name prefix or host", () => {
    expect(
      repositoryContainsPullRequest(
        "https://github.com/acme/api",
        "https://github.com/acme/api-x/pull/1",
      ),
    ).toBe(false);
    expect(
      repositoryContainsPullRequest(
        "https://gitlab.com/acme/api",
        "https://github.com/acme/api/pull/1",
      ),
    ).toBe(false);
  });
});

describe("resolvePullRequestCheckoutRoot", () => {
  const prUrl = "https://github.com/acme/api/pull/4";

  it.effect("runs in the linked repository's local clone when the project root has no remote", () =>
    Effect.gen(function* () {
      const clone = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pr-checkout-clone-"));
      const root = workspaceWith([
        { url: "https://github.com/acme/web.git", localPath: "/elsewhere", status: "cloned" },
        { url: "git@github.com:acme/api.git", localPath: clone, status: "updated" },
      ]);
      expect(yield* resolve({ cwd: root, reference: prUrl })).toBe(clone);
    }),
  );

  it.effect("keeps the project root when its own remote is the pull request's repository", () =>
    Effect.gen(function* () {
      const root = workspaceWith([
        { url: "https://github.com/acme/api.git", localPath: "/somewhere/else", status: "cloned" },
      ]);
      expect(
        yield* resolve({ cwd: root, reference: prUrl, remoteUrl: "git@github.com:acme/api.git" }),
      ).toBe(root);
    }),
  );

  it.effect("keeps the project root for a reference that names no repository", () =>
    Effect.gen(function* () {
      const root = workspaceWith([]);
      expect(yield* resolve({ cwd: root, reference: "#4" })).toBe(root);
    }),
  );

  it.effect(
    "keeps a root with its own remote when no linked repository claims the pull request",
    () =>
      Effect.gen(function* () {
        const root = workspaceWith([]);
        expect(
          yield* resolve({
            cwd: root,
            reference: prUrl,
            remoteUrl: "https://github.com/acme/other",
          }),
        ).toBe(root);
      }),
  );

  it.effect("says what to do when the root has no remote and nothing links the repository", () =>
    Effect.gen(function* () {
      const root = workspaceWith([]);
      const error = yield* resolve({ cwd: root, reference: prUrl }).pipe(Effect.flip);
      expect(error.message).toContain("no git remote");
      expect(error.message).toContain(prUrl);
    }),
  );

  it.effect("says what to do when the linked clone is not there yet or has gone", () =>
    Effect.gen(function* () {
      const pending = workspaceWith([
        { url: "https://github.com/acme/api.git", localPath: "", status: "pending" },
      ]);
      const pendingError = yield* resolve({ cwd: pending, reference: prUrl }).pipe(Effect.flip);
      expect(pendingError.message).toContain("still being cloned");

      const gone = workspaceWith([
        { url: "https://github.com/acme/api.git", localPath: "/no/such/clone", status: "cloned" },
      ]);
      const goneError = yield* resolve({ cwd: gone, reference: prUrl }).pipe(Effect.flip);
      expect(goneError.message).toContain("missing at '/no/such/clone'");
    }),
  );
});
