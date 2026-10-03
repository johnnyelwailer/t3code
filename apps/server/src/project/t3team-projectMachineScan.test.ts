import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { scanCheckout } from "./t3team-projectMachineScan.ts";

const makeCheckout = Effect.fn("makeCheckout")(function* (files: Record<string, string>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-machine-scan-" });
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    yield* fileSystem.makeDirectory(path.dirname(absolute), { recursive: true });
    yield* fileSystem.writeFileString(absolute, contents);
  }
  return root;
});

const scan = (files: Record<string, string>) =>
  makeCheckout(files).pipe(Effect.flatMap((root) => scanCheckout({ repository: ".", root })));

it.layer(NodeServices.layer)("scanCheckout", (it) => {
  describe("plain devcontainers", () => {
    it.effect("finds an image devcontainer, JSONC included", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".devcontainer/devcontainer.json": `{
            // comment
            "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
          }`,
        });
        expect(result.rejected).toEqual([]);
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
          repository: ".",
          devcontainerPath: ".devcontainer/devcontainer.json",
          machineFilePath: null,
          healthCheck: null,
          secrets: [],
        });
        expect(result.candidates[0]?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      }),
    );

    it.effect("finds root and nested devcontainers in spec order", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".devcontainer.json": `{ "image": "node:22" }`,
          ".devcontainer/web/devcontainer.json": `{ "image": "node:22" }`,
          ".devcontainer/api/devcontainer.json": `{ "image": "node:22" }`,
        });
        expect(result.candidates.map((c) => c.devcontainerPath)).toEqual([
          ".devcontainer.json",
          ".devcontainer/api/devcontainer.json",
          ".devcontainer/web/devcontainer.json",
        ]);
      }),
    );

    it.effect("hashes the Dockerfile the build reads, so editing it changes the hash", () =>
      Effect.gen(function* () {
        const devcontainer = `{ "build": { "dockerfile": "Dockerfile" } }`;
        const a = yield* scan({
          ".devcontainer/devcontainer.json": devcontainer,
          ".devcontainer/Dockerfile": "FROM node:22\n",
        });
        const b = yield* scan({
          ".devcontainer/devcontainer.json": devcontainer,
          ".devcontainer/Dockerfile": "FROM node:24\n",
        });
        expect(a.candidates[0]?.hash).toBeDefined();
        expect(a.candidates[0]?.hash).not.toBe(b.candidates[0]?.hash);
      }),
    );

    it.effect("rejects a devcontainer whose Dockerfile is missing", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".devcontainer/devcontainer.json": `{ "build": { "dockerfile": "Dockerfile" } }`,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]?.reason).toContain("does not exist");
      }),
    );

    it.effect("rejects a build reference that climbs out of the repository", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".devcontainer/devcontainer.json": `{ "build": { "dockerfile": "../../../etc/Dockerfile" } }`,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]?.reason).toContain("outside the repository");
      }),
    );

    it.effect("rejects a devcontainer with no build source, or two", () =>
      Effect.gen(function* () {
        const none = yield* scan({ ".devcontainer/devcontainer.json": `{ "name": "x" }` });
        const both = yield* scan({
          ".devcontainer/devcontainer.json": `{ "image": "a", "dockerComposeFile": "c.yml" }`,
          ".devcontainer/c.yml": "services: {}\n",
        });
        expect(none.rejected[0]?.reason).toContain("exactly one");
        expect(both.rejected[0]?.reason).toContain("exactly one");
      }),
    );

    it.effect("finds nothing in a repository without a definition", () =>
      Effect.gen(function* () {
        expect(yield* scan({ "README.md": "# hi" })).toEqual({ candidates: [], rejected: [] });
      }),
    );

    it.effect("resolves a root .devcontainer.json's Dockerfile against the repository root", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".devcontainer.json": `{ "build": { "dockerfile": "Dockerfile" } }`,
          Dockerfile: "FROM node:22\n",
        });
        expect(result.rejected).toEqual([]);
        expect(result.candidates.map((c) => c.devcontainerPath)).toEqual([".devcontainer.json"]);
      }),
    );

    it.effect(
      "rejects an absolute build reference even when a same-named relative file exists",
      () =>
        Effect.gen(function* () {
          const result = yield* scan({
            ".devcontainer/devcontainer.json": `{ "build": { "dockerfile": "/Dockerfile" } }`,
            ".devcontainer/Dockerfile": "FROM node:22\n",
          });
          expect(result.candidates).toEqual([]);
          expect(result.rejected[0]?.reason).toContain("outside the repository");
        }),
    );

    it.effect("reads a space-prefixed Dockerfile name as written, never trimmed", () =>
      Effect.gen(function* () {
        const devcontainer = `{ "build": { "dockerfile": " Dockerfile" } }`;
        const spaced = yield* scan({
          ".devcontainer/devcontainer.json": devcontainer,
          ".devcontainer/ Dockerfile": "FROM node:22\n",
          ".devcontainer/Dockerfile": "FROM node:24\n",
        });
        const plainOnly = yield* scan({
          ".devcontainer/devcontainer.json": devcontainer,
          ".devcontainer/Dockerfile": "FROM node:24\n",
        });
        expect(spaced.candidates).toHaveLength(1);
        expect(plainOnly.candidates).toEqual([]);
        expect(plainOnly.rejected[0]?.reason).toContain("does not exist");
      }),
    );

    it.effect("rejects a blank image as no build source at all", () =>
      Effect.gen(function* () {
        const result = yield* scan({ ".devcontainer/devcontainer.json": `{ "image": "  " }` });
        expect(result.candidates).toEqual([]);
        expect(result.rejected).toHaveLength(1);
      }),
    );

    it.effect("skips a nested folder whose name the wire contract cannot carry", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".devcontainer/a\nb/devcontainer.json": `{ "image": "node:22" }`,
          ".devcontainer/ok/devcontainer.json": `{ "image": "node:22" }`,
        });
        expect(result.candidates.map((c) => c.devcontainerPath)).toEqual([
          ".devcontainer/ok/devcontainer.json",
        ]);
        expect(result.rejected).toEqual([]);
      }),
    );
  });

  describe(".nexi/machine.json", () => {
    it.effect("a directory where the pointer belongs is rejected and still decides alone", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".nexi/machine.json/keep": "",
          ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]?.reason).toBe(".nexi/machine.json is not a file.");
      }),
    );

    it.effect("an unreadable pointer is rejected and still decides alone", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".nexi/machine.json": " ".repeat(1024 * 1024 + 1),
          ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]).toMatchObject({
          path: ".nexi/machine.json",
          reason: ".nexi/machine.json is larger than 1 MB.",
        });
      }),
    );

    it.effect("a pointer decides alone and carries its health check and secrets", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".nexi/machine.json": `{
            "version": 1,
            "devcontainer": ".devcontainer/api/devcontainer.json",
            "healthCheck": "pnpm test --run smoke",
            "secrets": [{ "name": "NPM_TOKEN", "scope": "team" }]
          }`,
          ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
          ".devcontainer/api/devcontainer.json": `{ "image": "node:22" }`,
        });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
          devcontainerPath: ".devcontainer/api/devcontainer.json",
          machineFilePath: ".nexi/machine.json",
          healthCheck: "pnpm test --run smoke",
          secrets: [{ name: "NPM_TOKEN", scope: "team" }],
        });
      }),
    );

    it.effect("an invalid pointer is reported, not silently replaced by a devcontainer", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          ".nexi/machine.json": `{ "version": 2 }`,
          ".devcontainer/devcontainer.json": `{ "image": "node:22" }`,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected).toEqual([
          {
            repository: ".",
            path: ".nexi/machine.json",
            reason: ".nexi/machine.json is not a valid machine file.",
          },
        ]);
      }),
    );
  });

  it.effect("rejects a devcontainer that is a symlink out of the repository", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const outside = yield* makeCheckout({ "devcontainer.json": `{ "image": "node:22" }` });
      const root = yield* makeCheckout({});
      yield* fileSystem.makeDirectory(path.join(root, ".devcontainer"));
      yield* fileSystem.symlink(
        path.join(outside, "devcontainer.json"),
        path.join(root, ".devcontainer", "devcontainer.json"),
      );
      const result = yield* scanCheckout({ repository: ".", root });
      expect(result.candidates).toEqual([]);
      expect(result.rejected[0]?.reason).toContain("links outside the repository");
    }),
  );
});
