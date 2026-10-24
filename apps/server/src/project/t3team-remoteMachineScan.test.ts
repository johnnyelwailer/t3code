import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { scanCheckout } from "./t3team-projectMachineScan.ts";
import { scanRemote } from "./t3team-remoteMachineScan.ts";
import { remoteFixture, remoteCommit } from "./t3team-remoteMachine.fixtures.ts";

const image = '{"image":"node:24"}';
const pointer = JSON.stringify({
  version: 1,
  devcontainer: ".devcontainer/api/devcontainer.json",
  healthCheck: "node --version",
  secrets: [{ name: "API_KEY", scope: "team" }],
});
const trees: ReadonlyArray<Record<string, string>> = [
  { ".devcontainer/devcontainer.json": image },
  { ".devcontainer.json": image },
  {
    ".nexi/machine.json": pointer,
    ".devcontainer/api/devcontainer.json": '{"build":{"dockerfile":"Dockerfile"}}',
    ".devcontainer/api/Dockerfile": "FROM node:24\n",
    ".devcontainer.json": image,
  },
];

it.layer(NodeServices.layer)("remote machine scan", (it) => {
  it.effect.each(trees)("matches local validation, precedence and hashing: %#", (tree) =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: tree, localFiles: tree });
      const local = yield* scanCheckout({ root: fixture.root, repository: "." });
      const remote = yield* scanRemote({
        repository: ".",
        url: "https://nexplore.ghe.com/acme/api.git",
        cwd: fixture.root,
      }).pipe(Effect.provide(fixture.dependencies));
      expect(remote?.candidates).toEqual(local.candidates);
      expect(remote?.rejected).toEqual(local.rejected);
      expect(remote?.candidates).toHaveLength(1);
      expect(fixture.reads.length).toBeGreaterThan(0);
      expect(
        fixture.reads.every(
          (read) =>
            read.revision === remoteCommit &&
            read.host === "nexplore.ghe.com" &&
            read.repository === "acme/api",
        ),
      ).toBe(true);
    }),
  );

  it.effect("rejects an outside-repository build reference before any read of that path", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        files: { ".devcontainer.json": '{"build":{"dockerfile":"../outside/Dockerfile"}}' },
      });
      const result = yield* scanRemote({
        repository: ".",
        url: "https://github.com/acme/api",
        cwd: fixture.root,
      }).pipe(Effect.provide(fixture.dependencies));
      expect(result?.candidates).toEqual([]);
      expect(result?.rejected[0]?.reason).toContain("outside the repository");
      expect(fixture.reads.some((read) => read.path.includes("outside"))).toBe(false);
    }),
  );

  it.effect.each([{}, { ".devcontainer/api/devcontainer.json": image }])(
    "keeps missing and subfolder-only definitions out of rejections: %#",
    (files) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({ files });
        const result = yield* scanRemote({
          repository: ".",
          url: "https://github.com/acme/api",
          cwd: fixture.root,
        }).pipe(Effect.provide(fixture.dependencies));
        expect(result?.candidates).toEqual([]);
        expect(result?.rejected).toEqual([]);
        expect(fixture.reads.map((read) => read.path)).toEqual([
          ".nexi/machine.json",
          ".devcontainer/devcontainer.json",
          ".devcontainer.json",
        ]);
      }),
  );

  it.effect.each(["https://dev.azure.com/acme/project/_git/api", "https://bitbucket.org/acme/api"])(
    "has no remote definition for unsupported %s",
    (url) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({ unsupported: true, url });
        const result = yield* scanRemote({ repository: ".", url, cwd: fixture.root }).pipe(
          Effect.provide(fixture.dependencies),
          Effect.flip,
        );
        expect(result.reason).toContain("check the repository out locally");
        expect(fixture.commands).toEqual([]);
        expect(fixture.reads).toEqual([]);
      }),
  );

  it.effect("reads nested GitLab repositories at the pinned SHA", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        files: trees[0] ?? {},
        url: "git@gitlab.com:group/sub/api.git",
      });
      const result = yield* scanRemote({
        repository: "group/sub/api",
        url: "git@gitlab.com:group/sub/api.git",
        cwd: fixture.root,
      }).pipe(Effect.provide(fixture.dependencies));
      expect(result?.candidates).toHaveLength(1);
      expect(
        fixture.reads.every(
          (read) => read.repository === "group/sub/api" && read.host === "gitlab.com",
        ),
      ).toBe(true);
    }),
  );

  it.effect.each(["main\tHEAD\n", `${"b".repeat(39)}\tHEAD\n`])(
    "refuses an unresolved or non-full SHA: %#",
    (gitOutput) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({ gitOutput });
        const error = yield* scanRemote({
          repository: ".",
          url: "https://github.com/acme/api",
          cwd: fixture.root,
        }).pipe(Effect.provide(fixture.dependencies), Effect.flip);
        expect(error.reason).toContain("unsupported HEAD object ID");
        expect(fixture.reads).toEqual([]);
      }),
  );

  it.effect("keeps an unreachable remote separate from an invalid definition", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ gitExitCode: 128 });
      const error = yield* scanRemote({
        repository: ".",
        url: "https://github.com/acme/api",
        cwd: fixture.root,
      }).pipe(Effect.provide(fixture.dependencies), Effect.flip);
      expect(error._tag).toBe("RemoteUnavailable");
      expect(error.reason).toContain("could not be reached or access was refused");
      expect(fixture.reads).toEqual([]);
    }),
  );

  it.effect.each(["", "ref: refs/heads/main\tHEAD\n"])(
    "returns None for a remote with no HEAD: %#",
    (gitOutput) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({ gitOutput });
        const result = yield* scanRemote({
          repository: ".",
          url: "https://github.com/acme/api",
          cwd: fixture.root,
        }).pipe(Effect.provide(fixture.dependencies));
        expect(result).toBeNull();
        expect(fixture.reads).toEqual([]);
      }),
  );

  it.effect("accepts a SHA-256 object ID and pins every read to it", () =>
    Effect.gen(function* () {
      const commit = "b".repeat(64);
      const fixture = yield* remoteFixture({
        gitOutput: `${commit}\tHEAD\n`,
        files: trees[0] ?? {},
      });
      const result = yield* scanRemote({
        repository: ".",
        url: "https://github.com/acme/api",
        cwd: fixture.root,
      }).pipe(Effect.provide(fixture.dependencies));
      expect(result?.remote.commit).toBe(commit);
      expect(result?.candidates).toHaveLength(1);
      expect(fixture.reads.every((read) => read.revision === commit)).toBe(true);
    }),
  );

  it.effect("classifies truncated HEAD output without blaming credentials", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ gitTruncated: true });
      const error = yield* scanRemote({
        repository: ".",
        url: "https://github.com/acme/api",
        cwd: fixture.root,
      }).pipe(Effect.provide(fixture.dependencies), Effect.flip);
      expect(error.reason).toBe("The remote HEAD response was incomplete.");
      expect(fixture.reads).toEqual([]);
    }),
  );
});
