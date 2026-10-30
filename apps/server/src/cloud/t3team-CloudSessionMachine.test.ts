// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { afterEach, beforeEach } from "vite-plus/test";

import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "../t3team-project-repository-utils.ts";
import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { ProjectService } from "../project/ProjectService.ts";
import * as ProjectMachineDiscovery from "../project/t3team-ProjectMachineDiscovery.ts";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { CloudSessionMachines, layer } from "./t3team-CloudSessionMachine.ts";

const projectId = ProjectId.make("project-1");
const DEVCONTAINER = { ".devcontainer/devcontainer.json": `{ "image": "node:24" }` };
const MACHINE_WITH_SECRETS = JSON.stringify({
  version: 1,
  devcontainer: ".devcontainer/devcontainer.json",
  secrets: [
    { name: "NPM_TOKEN", scope: "team" },
    { name: "MY_KEY", scope: "user" },
  ],
});

const git = (cwd: string, ...args: Array<string>) =>
  NodeChildProcess.execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

const write = (root: string, files: Record<string, string>) => {
  for (const [relative, contents] of Object.entries(files)) {
    NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, relative)), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, relative), contents);
  }
};

/**
 * A project checkout on `main`, committed, with `origin` at `remote`. `pushed` records the commit
 * as `origin/main` (what a push leaves behind) and makes it the upstream.
 */
const checkout = (
  files: Record<string, string>,
  { remote = "git@nexplore.ghe.com:acme/api.git", pushed = true, objectFormat = "sha1" } = {},
) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-machine-session-"));
  git(root, "init", "-q", "-b", "main", `--object-format=${objectFormat}`);
  write(root, files);
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "base");
  git(root, "remote", "add", "origin", remote);
  if (pushed) {
    git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(root, "branch", "-q", "--set-upstream-to=origin/main", "main");
  }
  return root;
};

/** A committed repository with no `origin`, as a planning folder is. */
const localRepo = (files: Record<string, string>) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-machine-local-"));
  git(root, "init", "-q", "-b", "main");
  write(root, files);
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "base");
  return root;
};

const MANIFEST_PATH = `${HIDDEN_T3TEAM_DIR}/${REFERENCES_DIR_NAME}/${MANIFEST_FILE_NAME}`;

/** Records `entries` as the project's linked repositories, the way the reference manifest does. */
const link = (root: string, entries: ReadonlyArray<unknown>) =>
  write(root, { [MANIFEST_PATH]: JSON.stringify({ linkedRepositories: entries }) });

const cloned = (url: string, localPath: string) => ({ url, localPath, status: "cloned" });
const QA_URL = "https://nexplore.ghe.com/pj/nexi-machine-qa.git";
const LIB_URL = "https://nexplore.ghe.com/acme/lib.git";
const POINTER = {
  ...DEVCONTAINER,
  ".nexi/machine.json": JSON.stringify({
    version: 1,
    devcontainer: ".devcontainer/devcontainer.json",
  }),
};

const sessionIn = <A, E>(
  root: string,
  token: string,
  use: (machines: CloudSessionMachines["Service"]) => Effect.Effect<A, E>,
  /** The workspace root of other projects, by id: a user with several projects. */
  otherRoots: ReadonlyMap<string, string> = new Map(),
) => {
  const projects = Layer.mock(ProjectService)({
    getById: (id) =>
      Effect.succeed(
        Option.some({
          id,
          workspaceRoot: otherRoots.get(id) ?? root,
          title: "IES NG",
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-10-24T00:00:00Z",
          updatedAt: "2026-10-24T00:00:00Z",
          deletedAt: null,
        }),
      ),
  });
  const unavailable = (host: string) =>
    Effect.fail(new GitHubApi.GitHubApiAuthenticationError({ host, operation: "test" }));
  const gh = Layer.mock(GitHubApi.GitHubApi)({
    credential: (host) =>
      host === "nexplore.ghe.com" && token !== ""
        ? Effect.succeed({ token: Redacted.make(token), fingerprint: "fp" })
        : unavailable(host),
    rest: (input) =>
      input.host === "nexplore.ghe.com" && input.path === "user" && token !== ""
        ? Effect.succeed({
            status: 200,
            headers: {},
            body: JSON.stringify({ login: "pj", id: 7, name: "Philip J", email: null }),
            truncated: false,
            invalidUtf8: false,
          })
        : unavailable(input.host),
  });
  const dependencies = Layer.mergeAll(
    ProjectMachineDiscovery.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          projects,
          VcsProcess.layer,
          Layer.mock(PullRequestProviderRegistry)({ get: () => null, kinds: [] }),
        ),
      ),
    ),
    VcsProcess.layer,
    gh,
  ).pipe(Layer.provideMerge(NodeServices.layer));
  return Effect.gen(function* () {
    const machines = yield* CloudSessionMachines;
    return yield* use(machines);
  }).pipe(Effect.provide(layer.pipe(Layer.provide(dependencies))));
};

const resolveIn = (root: string, token = "ghp_user-token") =>
  sessionIn(root, token, (machines) => machines.resolve(projectId));

const setupIn = (root: string, token = "ghp_user-token") =>
  sessionIn(root, token, (machines) => machines.resolveSetup(projectId));

const plainIn = (root: string, token = "ghp_user-token") =>
  sessionIn(root, token, (machines) => machines.resolvePlain(projectId));

beforeEach(() => replaceFeatureFlagPresetValues(new Map([["CLOUD_PROJECT_MACHINE", true]])));
afterEach(() => replaceFeatureFlagPresetValues(new Map()));

describe("CloudSessionMachines.resolve", () => {
  it.effect("is a plain session while project machines are turned off", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["CLOUD_PROJECT_MACHINE", false]]));
      expect(yield* resolveIn(checkout(DEVCONTAINER))).toBeNull();
    }),
  );

  it.effect("pins a local SHA-256 machine definition", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER, { objectFormat: "sha256" });
      const machine = yield* resolveIn(root);
      expect(machine?.commit).toBe(git(root, "rev-parse", "HEAD"));
      expect(machine?.commit).toHaveLength(64);
    }),
  );

  it.effect("pins a pushed definition and carries the user's token, never a credential URL", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      const machine = yield* resolveIn(root);
      expect(machine).toEqual({
        repository: {
          url: "https://nexplore.ghe.com/acme/api.git",
          host: "nexplore.ghe.com",
          owner: "acme",
          name: "api",
        },
        commit: git(root, "rev-parse", "HEAD"),
        devcontainerPath: ".devcontainer/devcontainer.json",
        healthCheck: null,
        teamSecretNames: [],
        token: "ghp_user-token",
        author: { name: "Philip J", email: "7+pj@users.noreply.nexplore.ghe.com" },
      });
    }),
  );

  it.effect("is a plain session for a project without a definition", () =>
    Effect.gen(function* () {
      expect(yield* resolveIn(checkout({ "README.md": "hi" }))).toBeNull();
    }),
  );

  it.effect("pins the upstream tip when HEAD is unpushed but the definition is unchanged", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      const upstream = git(root, "rev-parse", "HEAD");
      write(root, { "src/app.ts": "x" });
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", "local work");
      const machine = yield* resolveIn(root);
      expect(machine?.commit).toBe(upstream);
    }),
  );

  it.effect("refuses a definition with unpushed changes, naming the fix", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      write(root, { ".devcontainer/devcontainer.json": `{ "image": "node:22" }` });
      git(root, "commit", "-qam", "change the machine");
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain("Push");
    }),
  );

  it.effect("refuses uncommitted definition edits", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      write(root, { ".devcontainer/devcontainer.json": `{ "image": "node:22" }` });
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain(".devcontainer/devcontainer.json");
    }),
  );

  it.effect("ignores a commit that only another remote has: the session clones origin", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER, { pushed: false });
      git(root, "remote", "add", "fork", "git@nexplore.ghe.com:someone/api.git");
      git(root, "update-ref", "refs/remotes/fork/main", "HEAD");
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
    }),
  );

  it.effect("refuses a project that was never pushed", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolveIn(checkout(DEVCONTAINER, { pushed: false })));
      expect(error.reason).toBe("machine_unavailable");
    }),
  );

  it.effect("reports a broken pointer instead of starting a plain session", () =>
    Effect.gen(function* () {
      const root = checkout({ ...DEVCONTAINER, ".nexi/machine.json": `{ "version": 2 }` });
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain(".nexi/machine.json");
    }),
  );

  it.effect("refuses an origin the session cannot fetch over https", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveIn(checkout(DEVCONTAINER, { remote: "/srv/git/api.git" })),
      );
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain("origin");
    }),
  );

  it.effect("carries team secret names and leaves user secrets unnamed here", () =>
    Effect.gen(function* () {
      const root = checkout({
        ...DEVCONTAINER,
        ".nexi/machine.json": MACHINE_WITH_SECRETS,
      });
      const machine = yield* resolveIn(root);
      expect(machine?.teamSecretNames).toEqual(["NPM_TOKEN"]);
    }),
  );

  it.effect("asks for a gh sign-in when the host has none", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolveIn(checkout(DEVCONTAINER), ""));
      expect(error.reason).toBe("repository_sign_in_required");
      expect(error.message).toContain("gh auth login --hostname nexplore.ghe.com");
      // The client signs in to exactly the repository's host, whatever its default login host is.
      expect(error.host).toBe("nexplore.ghe.com");
    }),
  );
});

describe("CloudSessionMachines.resolveSetup", () => {
  it.effect("checks the project out at the commit origin already has", () =>
    Effect.gen(function* () {
      const root = checkout({ "README.md": "hi" });
      const setup = yield* setupIn(root);
      expect(setup.repository.name).toBe("api");
      expect(setup.commit).toBe(git(root, "rev-parse", "HEAD"));
      expect(setup.token).toBe("ghp_user-token");
    }),
  );

  it.effect("refuses a project that already has a machine", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(setupIn(checkout(DEVCONTAINER)));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain("already has a machine");
    }),
  );

  it.effect("refuses a branch origin does not have yet", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(setupIn(checkout({ "README.md": "hi" }, { pushed: false })));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain("Push");
    }),
  );
});

describe("CloudSessionMachines.resolvePlain", () => {
  it.effect("checks a project without a machine out at its pushed HEAD, as the user", () =>
    Effect.gen(function* () {
      const root = checkout({ "README.md": "hi" });
      const plain = yield* plainIn(root);
      expect(plain).toEqual({
        kind: "checkout",
        checkout: {
          repository: {
            url: "https://nexplore.ghe.com/acme/api.git",
            host: "nexplore.ghe.com",
            owner: "acme",
            name: "api",
          },
          commit: git(root, "rev-parse", "HEAD"),
          token: "ghp_user-token",
          author: { name: "Philip J", email: "7+pj@users.noreply.nexplore.ghe.com" },
        },
      });
    }),
  );

  it.effect("uses a SHA-256 default branch for a plain session", () =>
    Effect.gen(function* () {
      const root = checkout({ "README.md": "hi" }, { objectFormat: "sha256" });
      const pushed = git(root, "rev-parse", "HEAD");
      git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      git(root, "checkout", "-q", "--orphan", "local-only");
      git(root, "commit", "-q", "-m", "disconnected local branch");
      const plain = yield* plainIn(root);
      expect(plain.kind === "checkout" ? plain.checkout.commit : null).toBe(pushed);
    }),
  );

  it.effect("falls back to the default branch when nothing of the current branch is pushed", () =>
    Effect.gen(function* () {
      const root = checkout({ "README.md": "hi" });
      const pushed = git(root, "rev-parse", "HEAD");
      git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      git(root, "checkout", "-q", "-b", "local-only");
      git(root, "commit", "-q", "--allow-empty", "-m", "unpushed");
      const plain = yield* plainIn(root);
      expect(plain.kind === "checkout" ? plain.checkout.commit : null).toBe(pushed);
    }),
  );

  it.effect("refuses a repository origin has nothing of, naming the fix", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(plainIn(checkout({ "README.md": "hi" }, { pushed: false })));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain("Push");
    }),
  );

  it.effect("resolves the project it is asked for, never another one the user has", () =>
    Effect.gen(function* () {
      const api = checkout({ "README.md": "api" }, { remote: "git@nexplore.ghe.com:acme/api.git" });
      const pol = checkout(
        { "README.md": "pol" },
        { remote: "git@nexplore.ghe.com:pti/polassist.git" },
      );
      const polId = ProjectId.make("project-2");
      const resolve = (id: ProjectId) =>
        sessionIn(
          api,
          "ghp_user-token",
          (machines) => machines.resolvePlain(id),
          new Map([[polId, pol]]),
        );
      const first = yield* resolve(projectId);
      const second = yield* resolve(polId);
      expect(first.kind === "checkout" ? first.checkout.repository.name : null).toBe("api");
      expect(second.kind === "checkout" ? second.checkout.repository : null).toMatchObject({
        owner: "pti",
        name: "polassist",
      });
      expect(second.kind === "checkout" ? second.checkout.commit : null).toBe(
        git(pol, "rev-parse", "HEAD"),
      );
    }),
  );

  it.effect("starts a project with no remote in a workspace named after it", () =>
    Effect.gen(function* () {
      const repository = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-plain-"));
      git(repository, "init", "-q", "-b", "main");
      const expected = { kind: "workspace", folder: "IES NG-781a8188", title: "IES NG" };
      expect(yield* plainIn(repository)).toEqual(expected);
      const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-plain-"));
      expect(yield* plainIn(folder)).toEqual(expected);
    }),
  );

  it.effect("refuses an origin the session cannot clone instead of starting an empty one", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        plainIn(checkout({ "README.md": "hi" }, { remote: "/srv/git/api.git" })),
      );
      expect(error.reason).toBe("machine_unavailable");
    }),
  );

  it.effect("asks for a gh sign-in when the host has none", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(plainIn(checkout({ "README.md": "hi" }), ""));
      expect(error.reason).toBe("repository_sign_in_required");
    }),
  );
});

describe("a project's machine comes from its own repository only", () => {
  // The reported defect: a planning folder (no origin) linking a QA fixture repository built a
  // machine from that fixture and named the session after it.
  const qaRepo = () => checkout(POINTER, { remote: "git@nexplore.ghe.com:pj/nexi-machine-qa.git" });
  const libRepo = () => checkout(DEVCONTAINER, { remote: "git@nexplore.ghe.com:acme/lib.git" });
  const planningFolderLinking = (...entries: ReadonlyArray<unknown>) => {
    const root = localRepo({ "README.md": "planning" });
    link(root, entries);
    return root;
  };
  const poolKeyIn = (root: string) =>
    sessionIn(root, "t", (machines) => machines.poolKeyOf(projectId));

  it.effect("does not build a machine from a linked repository for a project with no origin", () =>
    Effect.gen(function* () {
      const root = planningFolderLinking(cloned(QA_URL, qaRepo()));
      expect(yield* resolveIn(root)).toBeNull();
      expect(yield* plainIn(root)).toEqual({
        kind: "workspace",
        folder: "IES NG-781a8188",
        title: "IES NG",
      });
      expect(yield* poolKeyIn(root)).toBeNull();
    }),
  );

  it.effect("does not use a linked repository's machine for a project with its own origin", () =>
    Effect.gen(function* () {
      const root = checkout({ "README.md": "app" });
      link(root, [cloned(QA_URL, qaRepo())]);
      expect(yield* resolveIn(root)).toBeNull();
    }),
  );

  it.effect("uses the project's own machine whatever its linked repositories define", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      // The linked one has the committed pointer, which used to sort ahead of the project's own.
      link(root, [cloned(QA_URL, qaRepo())]);
      const machine = yield* resolveIn(root);
      expect(machine?.repository.name).toBe("api");
      expect(machine?.commit).toBe(git(root, "rev-parse", "HEAD"));
    }),
  );

  it.effect("makes no guess between two linked repositories, in either manifest order", () =>
    Effect.gen(function* () {
      const [qa, lib] = [qaRepo(), libRepo()];
      for (const order of [
        [cloned(QA_URL, qa), cloned(LIB_URL, lib)],
        [cloned(LIB_URL, lib), cloned(QA_URL, qa)],
      ]) {
        expect(yield* resolveIn(planningFolderLinking(...order))).toBeNull();
      }
    }),
  );

  it.effect("ignores a linked repository that was never cloned", () =>
    Effect.gen(function* () {
      const root = planningFolderLinking({
        url: QA_URL,
        localPath: NodePath.join(NodeOS.tmpdir(), "t3team-never-cloned-xyz"),
        status: "not-cloned",
      });
      expect(yield* resolveIn(root)).toBeNull();
    }),
  );

  it.effect("survives a missing, corrupt or partly unknown reference manifest", () =>
    Effect.gen(function* () {
      const corrupt = checkout(DEVCONTAINER);
      write(corrupt, { [MANIFEST_PATH]: "{ not json" });
      const unknown = checkout(DEVCONTAINER);
      link(unknown, [null, "x", {}, { url: QA_URL }, { status: "weird" }]);
      for (const root of [checkout(DEVCONTAINER), corrupt, unknown]) {
        expect((yield* resolveIn(root))?.repository.name).toBe("api");
      }
      const bare = localRepo({ "README.md": "planning" });
      write(bare, { [MANIFEST_PATH]: "{ not json" });
      expect(yield* resolveIn(bare)).toBeNull();
    }),
  );

  it.effect("is not blocked by a broken definition in a linked repository", () =>
    Effect.gen(function* () {
      const broken = checkout({ ...DEVCONTAINER, ".nexi/machine.json": `{ "version": 2 }` });
      expect(yield* resolveIn(planningFolderLinking(cloned(QA_URL, broken)))).toBeNull();
    }),
  );

  it.effect("still reports the project's own broken definition", () =>
    Effect.gen(function* () {
      const root = checkout({ ...DEVCONTAINER, ".nexi/machine.json": `{ "version": 2 }` });
      link(root, [cloned(QA_URL, qaRepo())]);
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain(".nexi/machine.json");
    }),
  );

  it.effect("fails on the project's own unpushed definition, not switching to a linked one", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER, { pushed: false });
      link(root, [cloned(QA_URL, qaRepo())]);
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain("Push");
    }),
  );

  it.effect("fails on the project's own dirty definition, not switching to a linked one", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      write(root, { ".devcontainer/devcontainer.json": `{ "image": "node:22" }` });
      link(root, [cloned(QA_URL, qaRepo())]);
      const error = yield* Effect.flip(resolveIn(root));
      expect(error.reason).toBe("machine_unavailable");
      expect(error.message).toContain(".devcontainer/devcontainer.json");
    }),
  );

  it.effect("an own machine without an origin fails; the project still has a plain session", () =>
    Effect.gen(function* () {
      const root = localRepo(DEVCONTAINER);
      expect((yield* Effect.flip(resolveIn(root))).reason).toBe("machine_unavailable");
      expect((yield* plainIn(root)).kind).toBe("workspace");
    }),
  );

  it.effect("asks for a gh sign-in for the own machine", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      link(root, [cloned(QA_URL, qaRepo())]);
      expect((yield* Effect.flip(resolveIn(root, ""))).reason).toBe("repository_sign_in_required");
    }),
  );

  it.effect("is a plain session while project machines are off, linked machines or not", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["CLOUD_PROJECT_MACHINE", false]]));
      const root = checkout(DEVCONTAINER);
      link(root, [cloned(QA_URL, qaRepo())]);
      expect(yield* resolveIn(root)).toBeNull();
      expect(yield* poolKeyIn(root)).toBeNull();
    }),
  );

  it.effect("resolves the same machine for concurrent creates on one project", () =>
    Effect.gen(function* () {
      const root = checkout(DEVCONTAINER);
      link(root, [cloned(QA_URL, qaRepo())]);
      const results = yield* sessionIn(root, "t", (machines) =>
        Effect.all(
          Array.from({ length: 4 }, () => machines.resolve(projectId)),
          { concurrency: "unbounded" },
        ),
      );
      expect(new Set(results.map((machine) => machine?.repository.name))).toEqual(new Set(["api"]));
      expect(new Set(results.map((machine) => machine?.commit)).size).toBe(1);
    }),
  );

  describe("setting a machine up", () => {
    it.effect("sets up the project's own repository although a linked one has a machine", () =>
      Effect.gen(function* () {
        const root = checkout({ "README.md": "hi" });
        link(root, [cloned(QA_URL, qaRepo())]);
        expect((yield* setupIn(root)).repository.name).toBe("api");
      }),
    );

    it.effect("never sets up in a linked repository for a project with no repository", () =>
      Effect.gen(function* () {
        const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-no-repo-"));
        link(folder, [cloned(LIB_URL, libRepo())]);
        const error = yield* Effect.flip(setupIn(folder));
        expect(error.reason).toBe("machine_unavailable");
        expect(error.message).toContain("no repository");
      }),
    );
  });
});
