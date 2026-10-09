/**
 * `fileAt`, `blobShas` and `project.linkedRepositories` against the REAL `PullRequestService`, with
 * fake providers behind the provider registry: a GitHub-shaped one, a GitLab-shaped one, and a
 * Bitbucket-shaped one that cannot read files. The reader is provider-neutral, so every file case
 * runs once per provider that can read.
 */
import { assert, it } from "@effect/vitest";
import {
  CHANGE_REQUEST_FILE_MAX_BYTES,
  CHANGE_REQUEST_FILE_MAX_LINES,
  ChangeRequestInputError,
  ChangeRequestScopeError,
  ChangeRequestUnsupportedError,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  BASE,
  HEAD,
  PINNED,
  forRun,
  projectId,
  providerCalls,
  reader,
  rejects,
} from "./t3team-scriptHostFiles.fixtures.ts";

const providers = [
  {
    name: "GitHub-shaped",
    ref: { repository: "acme/app", number: 1 },
    file: "src/a.ts",
    text: "one\ntwo\nthree\nfour\nfive\n",
    binary: "src/bin.dat",
    baseText: "old",
  },
  {
    name: "GitLab-shaped",
    ref: { repository: "group/proj", number: 2 },
    file: "lib/b.py",
    text: "alpha\nbeta\ngamma\n",
    binary: "lib/bin.dat",
    baseText: "before",
  },
] as const;

for (const provider of providers) {
  it.effect(`${provider.name}: fileAt reads the pinned head and base commits, never a branch`, () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      providerCalls.length = 0;
      const head = yield* Effect.promise(() =>
        cr.fileAt({ ref: provider.ref, path: provider.file, side: "head" }),
      );
      assert.deepStrictEqual(head.kind, "text");
      if (head.kind !== "text") return;
      assert.strictEqual(head.sha, HEAD);
      assert.strictEqual(head.text, provider.text.replace(/\n$/, ""));
      assert.deepStrictEqual(
        [head.startLine, head.endLine, head.totalLines, head.truncated],
        [
          1,
          provider.text.trimEnd().split("\n").length,
          provider.text.trimEnd().split("\n").length,
          false,
        ],
      );
      assert.match(head.blobSha, /^blob:/);
      const base = yield* Effect.promise(() =>
        cr.fileAt({ ref: provider.ref, path: provider.file, side: "base" }),
      );
      assert.deepInclude(base, { kind: "text", sha: BASE, text: provider.baseText });
      assert.deepStrictEqual(
        providerCalls
          .filter((call) => call.method === "readFileAtRevision")
          .map((call) => call.revision),
        [HEAD, BASE],
      );
    }),
  );

  it.effect(`${provider.name}: fileAt types binary and missing files`, () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      const binary = yield* Effect.promise(() =>
        cr.fileAt({ ref: provider.ref, path: provider.binary, side: "head" }),
      );
      assert.deepInclude(binary, { kind: "binary", sha: HEAD });
      const missing = yield* Effect.promise(() =>
        cr.fileAt({ ref: provider.ref, path: "nope/missing.ts", side: "head" }),
      );
      assert.deepStrictEqual(missing, { kind: "missing", path: "nope/missing.ts", sha: HEAD });
    }),
  );

  it.effect(
    `${provider.name}: fileAt refuses paths outside the repository before asking the provider`,
    () =>
      Effect.gen(function* () {
        const cr = yield* reader();
        for (const path of [
          "../secret",
          "/etc/passwd",
          "a/../../b",
          "a//b",
          "./a",
          "a\\b",
          "a/\u0000b",
          "",
        ]) {
          yield* rejects(
            () => cr.fileAt({ ref: provider.ref, path, side: "head" }),
            ChangeRequestInputError,
          );
          assert.deepStrictEqual(providerCalls, [], `provider asked for path '${path}'`);
        }
      }),
  );

  it.effect(`${provider.name}: blobShas reports present and deleted paths at the pinned head`, () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      providerCalls.length = 0;
      const paths = [provider.file, "src/deleted.ts", provider.file];
      const result = yield* Effect.promise(() => cr.blobShas(provider.ref, paths));
      assert.strictEqual(result.sha, HEAD);
      assert.deepStrictEqual(
        Object.keys(result.blobShas).sort(),
        [provider.file, "src/deleted.ts"].sort(),
      );
      assert.match(result.blobShas[provider.file]!, /^blob:/);
      assert.strictEqual(result.blobShas["src/deleted.ts"], null);
      // Content is not fetched for a staleness check: size 0 asks for the blob id alone.
      assert.deepStrictEqual(
        [
          ...new Set(
            providerCalls
              .filter((call) => call.method === "readFileAtRevision")
              .map((call) => call.maxBytes),
          ),
        ],
        [0],
      );
    }),
  );
}

it.layer(Layer.empty)("fileAt shaping and bounds", (it) => {
  const github1 = { repository: "acme/app", number: 1 };
  it.effect("an explicit sha reads that commit, and exactly one of side or sha is required", () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      const pinned = yield* Effect.promise(() =>
        cr.fileAt({ ref: github1, path: "src/a.ts", sha: PINNED }),
      );
      assert.deepInclude(pinned, { kind: "text", sha: PINNED, text: "pinned" });
      for (const bad of [
        { path: "src/a.ts" },
        { path: "src/a.ts", side: "head", sha: PINNED },
        { path: "src/a.ts", sha: "main" },
      ]) {
        yield* rejects(() => cr.fileAt({ ref: github1, ...bad } as never), ChangeRequestInputError);
      }
    }),
  );

  it.effect("a range returns only those lines; a range past the end is empty, not an error", () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      const at = (startLine: number, endLine: number) =>
        Effect.promise(() =>
          cr.fileAt({
            ref: github1,
            path: "src/a.ts",
            side: "head",
            range: { startLine, endLine },
          }),
        );
      assert.deepInclude(yield* at(2, 3), {
        text: "two\nthree",
        startLine: 2,
        endLine: 3,
        totalLines: 5,
        truncated: false,
      });
      assert.deepInclude(yield* at(4, 99), { text: "four\nfive", endLine: 5, truncated: false });
      assert.deepInclude(yield* at(9, 12), {
        text: "",
        startLine: 9,
        endLine: 8,
        totalLines: 5,
        truncated: false,
      });
      for (const [start, end] of [
        [0, 1],
        [3, 2],
        [1.5, 2],
      ] as const) {
        yield* rejects(
          () =>
            cr.fileAt({
              ref: github1,
              path: "src/a.ts",
              side: "head",
              range: { startLine: start, endLine: end },
            }),
          ChangeRequestInputError,
        );
      }
    }),
  );

  it.effect("a long file is cut at the line cap and says so; the rest is one more range away", () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      const first = yield* Effect.promise(() =>
        cr.fileAt({ ref: github1, path: "src/long.ts", side: "head" }),
      );
      assert.deepInclude(first, {
        kind: "text",
        startLine: 1,
        endLine: CHANGE_REQUEST_FILE_MAX_LINES,
        totalLines: CHANGE_REQUEST_FILE_MAX_LINES + 500,
        truncated: true,
      });
      const rest = yield* Effect.promise(() =>
        cr.fileAt({
          ref: github1,
          path: "src/long.ts",
          side: "head",
          range: {
            startLine: CHANGE_REQUEST_FILE_MAX_LINES + 1,
            endLine: CHANGE_REQUEST_FILE_MAX_LINES + 500,
          },
        }),
      );
      assert.deepInclude(rest, { truncated: false, endLine: CHANGE_REQUEST_FILE_MAX_LINES + 500 });
    }),
  );

  it.effect(
    "a file over the byte cap is typed too-large with its blob id, and empty files are text",
    () =>
      Effect.gen(function* () {
        const cr = yield* reader();
        const huge = yield* Effect.promise(() =>
          cr.fileAt({ ref: github1, path: "src/huge.ts", side: "head" }),
        );
        assert.deepInclude(huge, {
          kind: "too-large",
          size: CHANGE_REQUEST_FILE_MAX_BYTES + 1,
          maxBytes: CHANGE_REQUEST_FILE_MAX_BYTES,
        });
        assert.match((huge as { blobSha: string }).blobSha, /^blob:/);
        const empty = yield* Effect.promise(() =>
          cr.fileAt({ ref: github1, path: "src/empty.ts", side: "head" }),
        );
        assert.deepInclude(empty, { kind: "text", text: "", totalLines: 0, truncated: false });
      }),
  );

  it.effect("blobShas bounds its path count", () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      yield* rejects(() => cr.blobShas(github1, []), ChangeRequestInputError);
      const many = Array.from({ length: 101 }, (_, index) => `f${index}.ts`);
      yield* rejects(() => cr.blobShas(github1, many), ChangeRequestInputError);
      yield* rejects(() => cr.blobShas(github1, ["ok.ts", "../no"]), ChangeRequestInputError);
      assert.deepStrictEqual(providerCalls, []);
    }),
  );

  it.effect("an unlinked repository is refused before any provider is asked", () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      const ref = { repository: "evil/repo", number: 1 };
      yield* rejects(() => cr.fileAt({ ref, path: "a.ts", side: "head" }), ChangeRequestScopeError);
      assert.deepStrictEqual(providerCalls, []);
      yield* rejects(() => cr.blobShas(ref, ["a.ts"]), ChangeRequestScopeError);
      assert.deepStrictEqual(providerCalls, []);
    }),
  );

  it.effect("a host that cannot read files, or reports no commit, answers a typed refusal", () =>
    Effect.gen(function* () {
      const cr = yield* reader();
      const unsupported = yield* rejects(
        () =>
          cr.fileAt({ ref: { repository: "acme/legacy", number: 3 }, path: "a.ts", sha: PINNED }),
        ChangeRequestUnsupportedError,
      );
      assert.strictEqual(unsupported.reason, "host-cannot-read-files");
      const unreported = yield* rejects(
        () =>
          cr.fileAt({ ref: { repository: "group/noshas", number: 4 }, path: "a.ts", side: "head" }),
        ChangeRequestUnsupportedError,
      );
      assert.strictEqual(unreported.reason, "revision-not-reported");
    }),
  );

  it.effect(
    "linkedRepositories lists what changeRequests accepts, in neutral form, and nothing else",
    () =>
      Effect.gen(function* () {
        const ctx = yield* forRun(["integration.read"]);
        const repositories = yield* Effect.promise(() => ctx.project!.linkedRepositories());
        assert.strictEqual(ctx.project!.id, projectId);
        assert.deepStrictEqual(
          [...repositories].sort((a, b) => a.repository.localeCompare(b.repository)),
          [
            { provider: "github", host: "github.com", repository: "acme/app" },
            { provider: "bitbucket", host: "bitbucket.org", repository: "acme/legacy" },
            { provider: "gitlab", host: "gitlab.com", repository: "group/noshas" },
            { provider: "gitlab", host: "gitlab.com", repository: "group/proj" },
          ],
        );
        // No project paths, no tokens, no CLI state: only the three neutral fields per entry.
        for (const entry of repositories) {
          assert.deepStrictEqual(Object.keys(entry).sort(), ["host", "provider", "repository"]);
        }
      }),
  );

  it.effect("without integration.read the script has neither changeRequests nor project", () =>
    Effect.gen(function* () {
      const ctx = yield* forRun([]);
      assert.isUndefined(ctx.changeRequests);
      assert.isUndefined(ctx.project);
    }),
  );
});
