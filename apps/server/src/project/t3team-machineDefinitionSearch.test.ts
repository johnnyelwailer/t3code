import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import type { ProviderChangeRequest } from "@t3tools/source-control-core/server/PullRequestProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import { MachineDefinitionFinder, layer } from "./t3team-MachineDefinitionFinder.ts";
import { remoteFixture, remoteProjectId } from "./t3team-remoteMachine.fixtures.ts";

const NOW = "2026-10-29T00:00:00Z";
const sha = (n: number) => n.toString(16).padStart(40, "0");
const DEVCONTAINER = { ".devcontainer/devcontainer.json": '{"image":"node:24"}' };
const POINTER = {
  ".nexi/machine.json": '{"version":1,"devcontainer":".devcontainer/devcontainer.json"}',
  ...DEVCONTAINER,
};
const TOOLS_URL = "https://nexplore.ghe.com/acme/tools.git";

/** What `git ls-remote --symref <url> HEAD refs/heads/* ...` answers. */
const refsOutput = (input: {
  readonly main: number;
  readonly branches?: Record<string, number>;
  readonly pulls?: Record<number, number>;
}) =>
  [
    "ref: refs/heads/main\tHEAD",
    `${sha(input.main)}\tHEAD`,
    `${sha(input.main)}\trefs/heads/main`,
    ...Object.entries(input.branches ?? {}).map(([name, n]) => `${sha(n)}\trefs/heads/${name}`),
    ...Object.entries(input.pulls ?? {}).map(
      ([number, n]) => `${sha(n)}\trefs/pull/${number}/head`,
    ),
  ].join("\n");

const pull = (input: {
  readonly number: number;
  readonly state: "open" | "closed" | "merged";
  readonly closedAt?: string;
  readonly fork?: string;
}): ProviderChangeRequest => ({
  number: input.number,
  title: input.number === 12 ? "Add devcontainer" : `Change ${input.number}`,
  url: `https://nexplore.ghe.com/acme/api/pull/${input.number}`,
  author: { login: "ada", name: null, avatarUrl: null },
  headBranch: `topic-${input.number}`,
  headRepositoryNameWithOwner: input.fork ?? "acme/api",
  baseBranch: "main",
  state: input.state,
  isDraft: false,
  mergeability: "unknown",
  additions: 0,
  deletions: 0,
  createdAt: "2026-10-01T00:00:00Z",
  closedAt: input.closedAt ?? null,
  updatedAt: input.closedAt ?? "2026-10-28T00:00:00Z",
  reviewRequestLogins: [],
  labels: [],
});

const find = (options: Parameters<typeof remoteFixture>[0]) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(NOW));
    const fixture = yield* remoteFixture(options);
    const result = yield* MachineDefinitionFinder.pipe(
      Effect.flatMap((finder) => finder.find(remoteProjectId)),
      Effect.provide(layer.pipe(Layer.provide(fixture.dependencies))),
    );
    return { fixture, result };
  });

it.layer(NodeServices.layer)("machine definition search", (it) => {
  it.effect("finds a definition on the default branch, with the setup files beside it", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        files: { ...DEVCONTAINER, Dockerfile: "FROM node", ".npmrc": "x" },
        gitOutput: refsOutput({ main: 1 }),
      });
      expect(result.candidates).toEqual([
        {
          repository: "acme/api",
          ref: { kind: "branch", name: "main", state: "default" },
          where: "default branch",
          path: ".devcontainer/devcontainer.json",
          kind: "devcontainer",
          author: null,
          summary: ".devcontainer/devcontainer.json on the default branch 'main'",
          commit: sha(1),
        },
      ]);
      expect(result.setupHints.map((hint) => hint.path)).toEqual(["Dockerfile", ".npmrc"]);
      expect(result.checked).toEqual([{ repository: "acme/api", refs: ["main"], omitted: 0 }]);
      expect(result.unreadable).toEqual([]);
    }),
  );

  it.effect("finds a .nexi/machine.json on another branch", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        filesByRevision: { [sha(2)]: POINTER },
        gitOutput: refsOutput({ main: 1, branches: { setup: 2 } }),
      });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        kind: ".nexi/machine.json",
        path: ".nexi/machine.json",
        where: "other branch",
        ref: { kind: "branch", name: "setup", state: "open" },
        commit: sha(2),
      });
      expect(result.checked[0]?.refs).toEqual(["main", "setup"]);
    }),
  );

  it.effect("says when a branch has a definition file that is unusable", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        filesByRevision: { [sha(2)]: { ".nexi/machine.json": '{"version":2}' } },
        gitOutput: refsOutput({ main: 1, branches: { setup: 2 } }),
      });
      expect(result.candidates).toEqual([]);
      expect(result.unreadable).toEqual([
        {
          repository: "acme/api",
          reason:
            "setup has .nexi/machine.json, but it is unusable: .nexi/machine.json is not a valid machine file.",
        },
      ]);
    }),
  );

  it.effect("finds a definition on an open pull request, with its author and title", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        pulls: [pull({ number: 12, state: "open" })],
        filesByRevision: { [sha(3)]: DEVCONTAINER },
        gitOutput: refsOutput({ main: 1, pulls: { 12: 3 } }),
      });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        where: "open PR #12",
        author: "ada",
        ref: { kind: "pr", number: 12, name: "topic-12", state: "open" },
        summary: ".devcontainer/devcontainer.json on PR #12 'Add devcontainer'",
        commit: sha(3),
      });
    }),
  );

  it.effect("searches recently closed pull requests but not ones past the window", () =>
    Effect.gen(function* () {
      const { fixture, result } = yield* find({
        pulls: [
          pull({ number: 7, state: "closed", closedAt: "2026-10-20T00:00:00Z" }),
          pull({ number: 3, state: "merged", closedAt: "2026-08-01T00:00:00Z" }),
        ],
        filesByRevision: { [sha(4)]: DEVCONTAINER, [sha(5)]: DEVCONTAINER },
        gitOutput: refsOutput({ main: 1, pulls: { 7: 4, 3: 5 } }),
      });
      expect(result.candidates.map((candidate) => candidate.where)).toEqual([
        "recently closed PR #7",
      ]);
      expect(result.candidates[0]?.ref).toMatchObject({ kind: "pr", number: 7, state: "closed" });
      expect(result.checked[0]?.refs).toEqual(["main", "PR #7"]);
      const args = fixture.commands.flatMap((command) => command.args);
      expect(args).toContain("refs/pull/7/head");
      expect(args).not.toContain("refs/pull/3/head");
      expect(fixture.reads.every((read) => read.revision !== sha(5))).toBe(true);
    }),
  );

  it.effect("searches linked repositories too", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        filesByRevision: { [sha(9)]: DEVCONTAINER },
        gitOutput: (command) =>
          command.args.includes(TOOLS_URL) ? refsOutput({ main: 9 }) : refsOutput({ main: 1 }),
        manifest: (root) =>
          JSON.stringify({
            linkedRepositories: [
              { url: TOOLS_URL, localPath: `${root}/tools`, status: "not-cloned" },
            ],
          }),
      });
      expect(result.candidates.map((c) => [c.repository, c.where])).toEqual([
        ["acme/tools", "default branch"],
      ]);
      expect(result.checked.map((entry) => entry.repository)).toEqual(["acme/api", "acme/tools"]);
    }),
  );

  it.effect("reports what it looked at when nothing is found", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        pulls: [pull({ number: 2, state: "open" })],
        gitOutput: refsOutput({ main: 1, branches: { x: 2 }, pulls: { 2: 3 } }),
      });
      expect(result.candidates).toEqual([]);
      expect(result.setupHints).toEqual([]);
      expect(result.checked).toEqual([
        { repository: "acme/api", refs: ["main", "PR #2", "x"], omitted: 0 },
      ]);
    }),
  );

  it.effect("names an unreadable repository and still answers for the others", () =>
    Effect.gen(function* () {
      const { result } = yield* find({
        files: DEVCONTAINER,
        gitOutput: refsOutput({ main: 1 }),
        gitExitCodeFor: (command) => (command.args.includes(TOOLS_URL) ? 128 : 0),
        manifest: (root) =>
          JSON.stringify({
            linkedRepositories: [
              { url: TOOLS_URL, localPath: `${root}/tools`, status: "not-cloned" },
            ],
          }),
      });
      expect(result.candidates.map((candidate) => candidate.repository)).toEqual(["acme/api"]);
      expect(result.unreadable).toEqual([
        {
          repository: "acme/tools",
          reason: "The remote repository could not be reached or access was refused.",
        },
      ]);
    }),
  );

  it.effect("never puts a credential in the result, whether the search worked or not", () =>
    Effect.gen(function* () {
      const url = "https://x-access-token:ghp_secret123@nexplore.ghe.com/acme/api.git";
      const worked = yield* find({ url, files: DEVCONTAINER, gitOutput: refsOutput({ main: 1 }) });
      expect(worked.result.candidates).toHaveLength(1);
      expect(worked.fixture.commands[0]?.args).toContain(url);
      expect(JSON.stringify(worked.result)).not.toContain("ghp_");
      const refused = yield* find({ url, gitExitCode: 128 });
      expect(refused.result.unreadable).toHaveLength(1);
      expect(JSON.stringify(refused.result)).not.toContain("ghp_");
      const nowhere = yield* find({ url, enabled: false });
      expect(JSON.stringify(nowhere.result)).not.toContain("ghp_");
    }),
  );

  it.effect("caps the refs it reads per repository and says how many it left out", () =>
    Effect.gen(function* () {
      const branches = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`b${i}`, i + 10]));
      const { fixture, result } = yield* find({
        files: DEVCONTAINER,
        gitOutput: refsOutput({ main: 1, branches }),
      });
      expect(result.checked[0]?.refs).toHaveLength(21);
      expect(result.checked[0]?.omitted).toBe(5);
      expect(new Set(fixture.reads.map((read) => read.revision)).size).toBe(21);
    }),
  );

  it.effect("skips pull requests from forks and says so", () =>
    Effect.gen(function* () {
      const { fixture, result } = yield* find({
        pulls: [pull({ number: 5, state: "open", fork: "someone/api" })],
        gitOutput: refsOutput({ main: 1 }),
      });
      expect(result.unreadable.map((entry) => entry.reason)).toEqual([
        "Pull requests from forks were not searched: #5.",
      ]);
      expect(fixture.commands.flatMap((command) => command.args)).not.toContain("refs/pull/5/head");
    }),
  );

  it.effect("does no remote work while project machines are turned off", () =>
    Effect.gen(function* () {
      const { fixture, result } = yield* find({ enabled: false, files: DEVCONTAINER });
      expect(result.candidates).toEqual([]);
      expect(result.unreadable).toEqual([
        { repository: "acme/api", reason: "Remote machine discovery is turned off" },
      ]);
      expect(fixture.commands).toEqual([]);
      expect(fixture.reads).toEqual([]);
    }),
  );
});
