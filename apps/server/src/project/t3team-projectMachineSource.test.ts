import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import { ProjectMachineDiscovery } from "./t3team-ProjectMachineDiscovery.ts";
import { remoteFixture, remoteProjectId, remoteCommit } from "./t3team-remoteMachine.fixtures.ts";
import { MACHINE_SOURCE_FILE } from "./t3team-projectMachineSourceSetting.ts";

const branchTip = "b".repeat(40);
const DEVCONTAINER = { ".devcontainer/devcontainer.json": '{"image":"node:24"}' };
/** What `git ls-remote` answers: the default branch for HEAD, `branchTip` for the branch `setup`. */
const lsRemote = (command: { readonly args: ReadonlyArray<string> }) =>
  command.args.at(-1) === "refs/heads/setup"
    ? `${branchTip}\trefs/heads/setup\n`
    : command.args.at(-1) === "HEAD"
      ? `ref: refs/heads/main\tHEAD\n${remoteCommit}\tHEAD\n`
      : "";

const withService = <A, E, R>(
  use: (service: ProjectMachineDiscovery["Service"]) => Effect.Effect<A, E, R>,
) => ProjectMachineDiscovery.pipe(Effect.flatMap(use));

it.layer(NodeServices.layer)("project machine source", (it) => {
  it.effect("reads the project's own repository at its default branch when nothing is chosen", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const result = yield* withService((service) => service.resolveDefault(remoteProjectId)).pipe(
        Effect.provide(fixture.layer),
      );
      expect(result.source?.remote?.commit).toBe(remoteCommit);
      expect(result.sourceFailure).toBeUndefined();
      expect(result.discovery.source).toMatchObject({
        repository: "acme/api",
        branch: null,
        override: null,
      });
    }),
  );

  it.effect("scans the chosen repository and branch, pinned to the branch tip", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const result = yield* Effect.gen(function* () {
        const service = yield* ProjectMachineDiscovery;
        yield* service.setSource(remoteProjectId, { repository: "acme/tools", branch: "setup" });
        return yield* service.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(result.source?.machine.repository).toBe(".");
      expect(result.source?.remote).toEqual({
        url: "https://nexplore.ghe.com/acme/tools.git",
        commit: branchTip,
      });
      expect(fixture.reads.length).toBeGreaterThan(0);
      expect(fixture.reads.every((read) => read.revision === branchTip)).toBe(true);
      expect(fixture.reads.every((read) => read.repository === "acme/tools")).toBe(true);
      expect(fixture.commands[0]?.args).toEqual([
        "ls-remote",
        "--",
        "https://nexplore.ghe.com/acme/tools.git",
        "refs/heads/setup",
      ]);
      expect(result.discovery.source).toMatchObject({
        repository: "acme/tools",
        branch: "setup",
        commit: branchTip,
        override: { repository: "https://nexplore.ghe.com/acme/tools.git", branch: "setup" },
      });
    }),
  );

  it.effect(
    "reads another branch of the project's own repository, even with a local checkout",
    () =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({
          files: DEVCONTAINER,
          localFiles: { ".git/HEAD": "ref: refs/heads/main" },
          gitOutput: lsRemote,
        });
        const result = yield* Effect.gen(function* () {
          const service = yield* ProjectMachineDiscovery;
          yield* service.setSource(remoteProjectId, { branch: "setup" });
          return yield* service.resolveDefault(remoteProjectId);
        }).pipe(Effect.provide(fixture.layer));
        expect(result.source?.remote?.url).toBe("https://nexplore.ghe.com/acme/api.git");
        expect(result.source?.remote?.commit).toBe(branchTip);
      }),
  );

  it.effect("names a branch that does not exist and never falls back to a plain session", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const result = yield* Effect.gen(function* () {
        const service = yield* ProjectMachineDiscovery;
        yield* service.setSource(remoteProjectId, { branch: "nope" });
        return yield* service.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(result.source).toBeNull();
      expect(result.sourceFailure).toBe("Branch nope was not found in acme/api.");
      expect(result.discovery.status).toEqual({
        _tag: "None",
        reason: "Branch nope was not found in acme/api.",
      });
    }),
  );

  it.effect("names a repository that is missing or not readable with the user's sign-in", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitExitCode: 128 });
      const result = yield* Effect.gen(function* () {
        const service = yield* ProjectMachineDiscovery;
        yield* service.setSource(remoteProjectId, { repository: "acme/private", branch: "main" });
        return yield* service.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(result.sourceFailure).toBe(
        "Repository acme/private was not found, or your sign-in cannot read it.",
      );
    }),
  );

  it.effect("says what was checked when the chosen place holds no definition", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: {}, gitOutput: lsRemote });
      const result = yield* Effect.gen(function* () {
        const service = yield* ProjectMachineDiscovery;
        yield* service.setSource(remoteProjectId, { repository: "acme/tools", branch: "setup" });
        return yield* service.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(result.source).toBeNull();
      expect(result.sourceFailure).toBe(
        "No machine definition was found in acme/tools on branch setup. Checked .nexi/machine.json, .devcontainer/devcontainer.json and .devcontainer.json.",
      );
    }),
  );

  it.effect("fails, instead of going plain, when the chosen repository has no commits", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        files: DEVCONTAINER,
        gitOutput: "ref: refs/heads/main\tHEAD\n",
      });
      const result = yield* Effect.gen(function* () {
        const service = yield* ProjectMachineDiscovery;
        yield* service.setSource(remoteProjectId, { repository: "acme/empty" });
        return yield* service.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(result.source).toBeNull();
      expect(result.sourceFailure).toBe(
        "No machine definition was found in acme/empty on its default branch: it has no commits to read.",
      );
    }),
  );

  it.effect("resets to the default and removes the saved choice", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const saved = path.join(fixture.root, PROJECT_STATE_DIR, MACHINE_SOURCE_FILE);
      const result = yield* Effect.gen(function* () {
        const service = yield* ProjectMachineDiscovery;
        yield* service.setSource(remoteProjectId, { branch: "setup" });
        expect(yield* fs.exists(saved)).toBe(true);
        yield* service.setSource(remoteProjectId, null);
        expect(yield* fs.exists(saved)).toBe(false);
        return yield* service.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(result.source?.remote?.commit).toBe(remoteCommit);
      expect(result.discovery.source?.override).toBeNull();
    }),
  );

  it.effect("never stores a credential: a URL carrying one is refused and nothing is written", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const error = yield* withService((service) =>
        service.setSource(remoteProjectId, {
          repository: "https://alice:ghp_secret@nexplore.ghe.com/acme/tools.git",
        }),
      ).pipe(Effect.flip, Effect.provide(fixture.layer));
      expect(error.reason).toBe("invalid_source");
      expect(error.message).not.toContain("ghp_secret");
      expect(
        yield* fs.exists(path.join(fixture.root, PROJECT_STATE_DIR, MACHINE_SOURCE_FILE)),
      ).toBe(false);
    }),
  );

  it.effect("saves only the repository URL and branch", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* withService((service) =>
        service.setSource(remoteProjectId, { repository: "acme/tools", branch: "setup" }),
      ).pipe(Effect.provide(fixture.layer));
      const saved = yield* fs.readFileString(
        path.join(fixture.root, PROJECT_STATE_DIR, MACHINE_SOURCE_FILE),
      );
      expect(JSON.parse(saved)).toEqual({
        version: 1,
        url: "https://nexplore.ghe.com/acme/tools.git",
        branch: "setup",
      });
    }),
  );

  it.effect.each([
    "",
    "a..b",
    "-x",
    "a b",
    "x.lock",
    "a~1",
    "a/",
    "a\u200Bb",
    "a\u202Eb",
    "a\uFEFFb",
  ])("refuses the branch name %j", (branch) =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: DEVCONTAINER, gitOutput: lsRemote });
      const error = yield* withService((service) =>
        service.setSource(remoteProjectId, { branch: branch === "" ? " " : branch }),
      ).pipe(Effect.flip, Effect.provide(fixture.layer));
      expect(error.reason).toBe("invalid_source");
    }),
  );
});
