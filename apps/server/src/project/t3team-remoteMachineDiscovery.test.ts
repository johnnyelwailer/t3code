import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as Discovery from "./t3team-ProjectMachineDiscovery.ts";
import { remoteFixture, remoteProjectId, remoteCommit } from "./t3team-remoteMachineTestUtils.ts";
import { HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME } from "../t3team-project-repository-utils.ts";

it.layer(NodeServices.layer)("remote machine discovery", (it) => {
  it.effect("keeps a local definition usable when a linked remote cannot be reached", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        localFiles: {
          ".git/HEAD": "ref: refs/heads/main",
          ".devcontainer.json": '{"image":"local"}',
        },
        gitExitCode: 128,
        manifest: (root) =>
          JSON.stringify({
            linkedRepositories: [
              {
                url: "https://github.com/acme/linked",
                localPath: `${root}/missing`,
                status: "not-cloned",
              },
            ],
          }),
      });
      const result = yield* Discovery.ProjectMachineDiscovery.pipe(
        Effect.flatMap((service) => service.resolveDefault(remoteProjectId)),
        Effect.provide(fixture.layer),
      );
      expect(result.source?.machine.repository).toBe(".");
      expect(result.source?.remote).toBeUndefined();
      expect(result.discovery.rejected[0]).toMatchObject({
        repository: "acme/linked",
        reason: expect.stringContaining("git credentials"),
      });
    }),
  );
  it.effect("does no remote work while project machines are disabled", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        enabled: false,
        files: { ".devcontainer.json": '{"image":"node:24"}' },
      });
      const result = yield* Discovery.ProjectMachineDiscovery.pipe(
        Effect.flatMap((service) => service.discover(remoteProjectId)),
        Effect.provide(fixture.layer),
      );
      expect(result.status).toEqual({ _tag: "None" });
      expect(fixture.commands).toEqual([]);
      expect(fixture.reads).toEqual([]);
    }),
  );
  it.effect(
    "discovers a machine without a checkout and pins every read to the default branch SHA",
    () =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({
          files: { ".devcontainer/devcontainer.json": '{"image":"node:24"}' },
        });
        const result = yield* Discovery.ProjectMachineDiscovery.pipe(
          Effect.flatMap((service) => service.resolveDefault(remoteProjectId)),
          Effect.provide(fixture.layer),
        );
        expect(result.discovery.status._tag).toBe("Detected");
        expect(result.source).toMatchObject({
          remote: {
            url: fixture.project.repositoryIdentity?.locator.remoteUrl,
            commit: remoteCommit,
          },
        });
        expect(fixture.reads.every((read) => read.revision === remoteCommit)).toBe(true);
        expect(fixture.commands[0]?.args).toEqual([
          "ls-remote",
          "--symref",
          "--",
          "https://nexplore.ghe.com/acme/api.git",
          "HEAD",
        ]);
      }),
  );

  it.effect.each([
    { ".git/HEAD": "ref: refs/heads/main" },
    { ".git/HEAD": "ref: refs/heads/main", ".devcontainer.json": '{"image":"local"}' },
  ])("keeps a local checkout authoritative: %#", (localFiles) =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        files: { ".devcontainer.json": '{"image":"remote"}' },
        localFiles,
      });
      const result = yield* Discovery.ProjectMachineDiscovery.pipe(
        Effect.flatMap((service) => service.resolveDefault(remoteProjectId)),
        Effect.provide(fixture.layer),
      );
      expect(result.discovery.candidates).toHaveLength(Object.keys(localFiles).length - 1);
      expect(result.source?.remote).toBeUndefined();
      expect(fixture.commands).toEqual([]);
      expect(fixture.reads).toEqual([]);
      expect(result.checkouts).toEqual([{ repository: ".", root: fixture.root }]);
    }),
  );

  it.effect.each(["not-cloned", "pending", "failed", "cloned"])(
    "scans a linked repository with no checkout: %s",
    (status) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({
          ownRemote: false,
          files: { ".devcontainer.json": '{"image":"node:24"}' },
          manifest: (root) =>
            JSON.stringify({
              linkedRepositories: [
                { url: "https://github.com/acme/linked", localPath: `${root}/missing`, status },
              ],
            }),
        });
        const result = yield* Discovery.ProjectMachineDiscovery.pipe(
          Effect.flatMap((service) => service.resolveDefault(remoteProjectId)),
          Effect.provide(fixture.layer),
        );
        expect(result.source?.machine.repository).toBe("acme/linked");
        expect(result.source?.remote?.commit).toBe(remoteCommit);
        expect(result.checkouts).toEqual([]);
      }),
  );

  it.effect("reads a linked local checkout without contacting its remote", () =>
    Effect.gen(function* () {
      const linked = `${HIDDEN_T3TEAM_DIR}/${REFERENCES_DIR_NAME}/linked`;
      const fixture = yield* remoteFixture({
        ownRemote: false,
        localFiles: {
          [`${linked}/.git/HEAD`]: "ref: refs/heads/main",
          [`${linked}/.devcontainer.json`]: '{"image":"local"}',
        },
        manifest: (root) =>
          JSON.stringify({
            linkedRepositories: [
              {
                url: "https://github.com/acme/linked",
                localPath: `${root}/${linked}`,
                status: "cloned",
              },
            ],
          }),
      });
      const result = yield* Discovery.ProjectMachineDiscovery.pipe(
        Effect.flatMap((service) => service.resolveDefault(remoteProjectId)),
        Effect.provide(fixture.layer),
      );
      expect(result.source?.machine.repository).toBe("acme/linked");
      expect(result.source?.remote).toBeUndefined();
      expect(fixture.commands).toEqual([]);
    }),
  );

  it.effect(
    "uses remote discovery for a stale cloned manifest whose directory is not a checkout",
    () =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({
          ownRemote: false,
          localFiles: { "missing/README.md": "partial clone" },
          files: { ".devcontainer.json": '{"image":"node:24"}' },
          manifest: (root) =>
            JSON.stringify({
              linkedRepositories: [
                {
                  url: "https://github.com/acme/linked",
                  localPath: `${root}/missing`,
                  status: "cloned",
                },
              ],
            }),
        });
        const result = yield* Discovery.ProjectMachineDiscovery.pipe(
          Effect.flatMap((service) => service.resolveDefault(remoteProjectId)),
          Effect.provide(fixture.layer),
        );
        expect(result.source?.remote?.commit).toBe(remoteCommit);
        expect(result.checkouts).toEqual([]);
      }),
  );

  it.effect("returns the remote search limitation as a None reason", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        files: { ".devcontainer/api/devcontainer.json": '{"image":"node:24"}' },
      });
      const result = yield* Discovery.ProjectMachineDiscovery.pipe(
        Effect.flatMap((service) => service.discover(remoteProjectId)),
        Effect.provide(fixture.layer),
      );
      expect(result.status).toMatchObject({
        _tag: "None",
        reason: expect.stringContaining("local checkout or a .nexi/machine.json pointer"),
      });
      expect(result.rejected).toEqual([]);
    }),
  );

  it.effect("preserves the existing None result for unsupported providers", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ unsupported: true });
      const result = yield* Discovery.ProjectMachineDiscovery.pipe(
        Effect.flatMap((service) => service.discover(remoteProjectId)),
        Effect.provide(fixture.layer),
      );
      expect(result).toEqual({ status: { _tag: "None" }, candidates: [], rejected: [] });
    }),
  );
});
