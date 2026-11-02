import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  LEGACY_PROJECT_MACHINE_FILE_PATH,
  PROJECT_MACHINE_FILE_PATH,
  PROJECT_MACHINE_FILE_PATHS,
} from "@t3tools/contracts";
import { NEXI_PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";

import { scanDefinition } from "./t3team-machineDefinitionScan.ts";
import { scanCheckout } from "./t3team-projectMachineScan.ts";

const NEW = ".agents/nexi/machine.json";
const LEGACY = ".nexi/machine.json";
const machine = (devcontainer: string) => JSON.stringify({ version: 1, devcontainer });
const devcontainer = `{ "image": "node:22" }`;

const makeCheckout = Effect.fn("makeCheckout")(function* (files: Record<string, string>) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-machine-agents-" });
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    yield* fileSystem.makeDirectory(path.dirname(absolute), { recursive: true });
    yield* fileSystem.writeFileString(absolute, contents);
  }
  return root;
});
const scan = (files: Record<string, string>) =>
  makeCheckout(files).pipe(Effect.flatMap((root) => scanCheckout({ repository: ".", root })));

describe("machine.json locations", () => {
  it("derives the contract paths from the one state dir name", () => {
    expect(PROJECT_MACHINE_FILE_PATH).toBe(`${NEXI_PROJECT_STATE_DIR}/machine.json`);
    expect(PROJECT_MACHINE_FILE_PATH).toBe(NEW);
    expect(LEGACY_PROJECT_MACHINE_FILE_PATH).toBe(LEGACY);
    expect(PROJECT_MACHINE_FILE_PATHS).toEqual([NEW, LEGACY]);
  });
});

it.layer(NodeServices.layer)("scanCheckout finds machine.json at either location", (it) => {
  describe("local checkout", () => {
    it.effect("finds .agents/nexi/machine.json", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          [NEW]: machine(".devcontainer/devcontainer.json"),
          ".devcontainer/devcontainer.json": devcontainer,
        });
        expect(result.rejected).toEqual([]);
        expect(result.candidates[0]).toMatchObject({ machineFilePath: NEW });
        expect(result.candidates[0]?.files[0]).toBe(NEW);
      }),
    );

    it.effect("still finds the legacy .nexi/machine.json", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          [LEGACY]: machine(".devcontainer/devcontainer.json"),
          ".devcontainer/devcontainer.json": devcontainer,
        });
        expect(result.rejected).toEqual([]);
        expect(result.candidates[0]).toMatchObject({ machineFilePath: LEGACY });
      }),
    );

    it.effect("the new location wins when both exist", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          [NEW]: machine(".devcontainer/new/devcontainer.json"),
          [LEGACY]: machine(".devcontainer/old/devcontainer.json"),
          ".devcontainer/new/devcontainer.json": devcontainer,
          ".devcontainer/old/devcontainer.json": devcontainer,
        });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
          machineFilePath: NEW,
          devcontainerPath: ".devcontainer/new/devcontainer.json",
        });
      }),
    );

    it.effect("an invalid new file is reported, never replaced by the legacy one", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          [NEW]: `{ "version": 2 }`,
          [LEGACY]: machine(".devcontainer/devcontainer.json"),
          ".devcontainer/devcontainer.json": devcontainer,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]).toMatchObject({
          path: NEW,
          reason: `${NEW} is not a valid machine file. ${LEGACY} exists and was not used.`,
        });
      }),
    );

    it.effect("an unreadable new file says a legacy file exists and was not used", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          [NEW]: " ".repeat(1024 * 1024 + 1),
          [LEGACY]: machine(".devcontainer/devcontainer.json"),
          ".devcontainer/devcontainer.json": devcontainer,
        });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]?.reason).toBe(
          `${NEW} is larger than 1 MB. ${LEGACY} exists and was not used.`,
        );
      }),
    );

    it.effect("without a legacy file the rejection says nothing about one", () =>
      Effect.gen(function* () {
        const result = yield* scan({ [NEW]: `{ "version": 2 }` });
        expect(result.rejected[0]?.reason).toBe(`${NEW} is not a valid machine file.`);
      }),
    );

    it.effect("a definition that shadows a different legacy file carries a note", () =>
      Effect.gen(function* () {
        const result = yield* scan({
          [NEW]: machine(".devcontainer/devcontainer.json"),
          [LEGACY]: machine(".devcontainer.json"),
          ".devcontainer/devcontainer.json": devcontainer,
        });
        expect(result.candidates[0]?.note).toBe(`${NEW} shadows ${LEGACY}, which is not used.`);
      }),
    );

    it.effect("no note when the legacy file is identical, absent, or the only one", () =>
      Effect.gen(function* () {
        const same = machine(".devcontainer/devcontainer.json");
        const files = { ".devcontainer/devcontainer.json": devcontainer };
        expect(
          (yield* scan({ ...files, [NEW]: same, [LEGACY]: same })).candidates[0]?.note,
        ).toBeUndefined();
        expect((yield* scan({ ...files, [NEW]: same })).candidates[0]?.note).toBeUndefined();
        expect((yield* scan({ ...files, [LEGACY]: same })).candidates[0]?.note).toBeUndefined();
      }),
    );

    it.effect("a symlinked .agents directory pointing out of the repository is rejected", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outside = yield* makeCheckout({
          "nexi/machine.json": machine(".devcontainer/devcontainer.json"),
        });
        const root = yield* makeCheckout({ ".devcontainer/devcontainer.json": devcontainer });
        yield* fileSystem.symlink(outside, path.join(root, ".agents"));
        const result = yield* scanCheckout({ repository: ".", root });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]).toMatchObject({ path: NEW });
        expect(result.rejected[0]?.reason).toContain("links outside the repository");
      }),
    );

    it.effect("a pointer that escapes the repository is still refused (invalid machine file)", () =>
      Effect.gen(function* () {
        const result = yield* scan({ [NEW]: machine("../../outside/devcontainer.json") });
        expect(result.candidates).toEqual([]);
        expect(result.rejected[0]?.reason).toBe(`${NEW} is not a valid machine file.`);
      }),
    );
  });

  describe("remote reader", () => {
    const remote = (files: Record<string, string>, reads: string[]) =>
      scanDefinition({
        repository: "o/r",
        reader: {
          read: (path) => Effect.sync(() => (reads.push(path), files[path] ?? null)),
          nestedPaths: Effect.succeed([]),
        },
      });

    it.effect("asks for the new location first; the legacy one is read only to note a shadow", () =>
      Effect.gen(function* () {
        const reads: string[] = [];
        const result = yield* remote(
          { [NEW]: machine(".devcontainer.json"), ".devcontainer.json": devcontainer },
          reads,
        );
        expect(result.candidates[0]).toMatchObject({ machineFilePath: NEW });
        expect(reads.slice(0, 2)).toEqual([NEW, LEGACY]);
      }),
    );

    it.effect("falls back to the legacy location when the new one is absent", () =>
      Effect.gen(function* () {
        const reads: string[] = [];
        const result = yield* remote(
          { [LEGACY]: machine(".devcontainer.json"), ".devcontainer.json": devcontainer },
          reads,
        );
        expect(result.candidates[0]).toMatchObject({ machineFilePath: LEGACY });
        expect(reads.slice(0, 2)).toEqual([NEW, LEGACY]);
      }),
    );

    it.effect("falls through to a plain devcontainer when neither exists", () =>
      Effect.gen(function* () {
        const reads: string[] = [];
        const result = yield* remote({ ".devcontainer.json": devcontainer }, reads);
        expect(result.candidates[0]).toMatchObject({ machineFilePath: null });
        expect(reads.slice(0, 2)).toEqual([NEW, LEGACY]);
      }),
    );
  });
});
