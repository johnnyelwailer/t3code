import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  MACHINE_SOURCE_ACCEPT_LABEL,
  type ProjectMachineSourceSetting,
  decodeMachineSourceQuestionId,
  encodeMachineSourceQuestionId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { layer, MachineSourceProposal } from "./t3team-MachineSourceProposal.ts";
import { ProjectMachineDiscovery } from "./t3team-ProjectMachineDiscovery.ts";
import { remoteCommit, remoteFixture, remoteProjectId } from "./t3team-remoteMachine.fixtures.ts";

const branchTip = "b".repeat(40);
const TOOLS_URL = "https://nexplore.ghe.com/acme/tools.git";
const DEVCONTAINER = { ".devcontainer/devcontainer.json": '{"image":"node:24"}' };
/** What `git ls-remote` answers: the default branch for HEAD, `branchTip` for the branch `setup`. */
const lsRemote = (command: { readonly args: ReadonlyArray<string> }) =>
  command.args.at(-1) === "refs/heads/setup"
    ? `${branchTip}\trefs/heads/setup\n`
    : command.args.at(-1) === "HEAD"
      ? `ref: refs/heads/main\tHEAD\n${remoteCommit}\tHEAD\n`
      : "";

type FixtureOptions = Parameters<typeof remoteFixture>[0];

/** A fixture and the `verify` call against it, not yet run. */
const prove = (options: FixtureOptions, proposal: ProjectMachineSourceSetting) =>
  Effect.gen(function* () {
    const fixture = yield* remoteFixture(options);
    const provided = Layer.provide(layer, fixture.dependencies);
    const verify = MachineSourceProposal.pipe(
      Effect.flatMap((service) => service.verify(remoteProjectId, proposal)),
      Effect.provide(provided),
    );
    return { fixture, verify };
  });

const verified = (options: FixtureOptions, proposal: ProjectMachineSourceSetting) =>
  Effect.gen(function* () {
    const { fixture, verify } = yield* prove(options, proposal);
    return { fixture, value: yield* verify };
  });

const refused = (options: FixtureOptions, proposal: ProjectMachineSourceSetting) =>
  Effect.gen(function* () {
    const { fixture, verify } = yield* prove(options, proposal);
    return { fixture, error: yield* Effect.flip(verify) };
  });

it.layer(NodeServices.layer)("machine source proposal", (it) => {
  it.effect("accepts a readable branch that holds a definition, pinned to its tip", () =>
    Effect.gen(function* () {
      const { fixture, value } = yield* verified(
        { files: DEVCONTAINER, gitOutput: lsRemote },
        { repository: "acme/tools", branch: "setup" },
      );
      expect(value).toEqual({
        setting: { repository: TOOLS_URL, branch: "setup" },
        repository: "acme/tools",
        branch: "setup",
        commit: branchTip,
      });
      expect(fixture.reads.every((read) => read.revision === branchTip)).toBe(true);
      // The id the question carries decodes to exactly the normalized setting.
      const id = encodeMachineSourceQuestionId(value.setting);
      expect(decodeMachineSourceQuestionId(id)).toEqual(value.setting);
    }),
  );

  it.effect("refuses a repository URL with a credential and reads nothing", () =>
    Effect.gen(function* () {
      const { fixture, error } = yield* refused(
        { files: DEVCONTAINER, gitOutput: lsRemote },
        { repository: "https://alice:ghp_secret@nexplore.ghe.com/acme/tools.git" },
      );
      expect(error.reason).toBe("invalid_source");
      expect(error.message).not.toContain("ghp_secret");
      expect(fixture.commands).toEqual([]);
      expect(fixture.reads).toEqual([]);
    }),
  );

  it.effect("names a branch that does not exist", () =>
    Effect.gen(function* () {
      const { error } = yield* refused(
        { files: DEVCONTAINER, gitOutput: lsRemote },
        { repository: "acme/tools", branch: "nope" },
      );
      expect(error.message).toBe("Branch nope was not found in acme/tools.");
    }),
  );

  it.effect("names a repository that is not readable with the user's sign-in", () =>
    Effect.gen(function* () {
      const { error } = yield* refused(
        { files: DEVCONTAINER, gitExitCode: 128 },
        { repository: "acme/private", branch: "main" },
      );
      expect(error.message).toBe(
        "Repository acme/private was not found, or your sign-in cannot read it.",
      );
    }),
  );

  it.effect("refuses a branch that holds no machine definition, saying what was checked", () =>
    Effect.gen(function* () {
      const { error } = yield* refused(
        { files: {}, gitOutput: lsRemote },
        { repository: "acme/tools", branch: "setup" },
      );
      expect(error.message).toContain(
        "No machine definition was found in acme/tools on branch setup.",
      );
    }),
  );

  it.effect("saves an accepted proposal through setSource and reads it back", () =>
    Effect.gen(function* () {
      const options = { files: DEVCONTAINER, gitOutput: lsRemote };
      const { fixture, value } = yield* verified(options, {
        repository: "acme/tools",
        branch: "setup",
      });
      // What the web client does with the question id and the answer it gets back.
      expect(MACHINE_SOURCE_ACCEPT_LABEL).toBe("Use this machine definition");
      const accepted = decodeMachineSourceQuestionId(encodeMachineSourceQuestionId(value.setting));
      expect(accepted).not.toBeNull();
      const resolved = yield* Effect.gen(function* () {
        const discovery = yield* ProjectMachineDiscovery;
        yield* discovery.setSource(remoteProjectId, accepted);
        return yield* discovery.resolveDefault(remoteProjectId);
      }).pipe(Effect.provide(fixture.layer));
      expect(resolved.source?.remote).toEqual({ url: TOOLS_URL, commit: branchTip });
      expect(resolved.discovery.source).toMatchObject({
        repository: "acme/tools",
        branch: "setup",
        override: { repository: TOOLS_URL, branch: "setup" },
      });
    }),
  );
});
