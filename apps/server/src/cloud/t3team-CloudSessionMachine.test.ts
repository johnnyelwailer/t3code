// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { type Project, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ProjectService } from "../project/ProjectService.ts";
import * as ProjectMachineDiscovery from "../project/t3team-ProjectMachineDiscovery.ts";
import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { CloudSessionMachines, layer } from "./t3team-CloudSessionMachine.ts";

const projectId = ProjectId.make("project-1");
const DEVCONTAINER = { ".devcontainer/devcontainer.json": `{ "image": "node:24" }` };

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
  { remote = "git@nexplore.ghe.com:acme/api.git", pushed = true } = {},
) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-machine-session-"));
  git(root, "init", "-q", "-b", "main");
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

const sessionIn = <A, E>(
  root: string,
  token: string,
  use: (machines: CloudSessionMachines["Service"]) => Effect.Effect<A, E>,
) => {
  const projects = Layer.mock(ProjectService)({
    getById: () => Effect.succeed(Option.some({ workspaceRoot: root } as unknown as Project)),
  });
  const gh = Layer.mock(GitHubCli.GitHubCli)({
    execute: (input) =>
      input.args.join(" ") === "auth token --hostname nexplore.ghe.com" && token !== ""
        ? Effect.succeed({ exitCode: 0, stdout: `${token}\n`, stderr: "" } as never)
        : input.args.join(" ") === "api --hostname nexplore.ghe.com user" && token !== ""
          ? Effect.succeed({
              exitCode: 0,
              stdout: JSON.stringify({ login: "pj", id: 7, name: "Philip J", email: null }),
              stderr: "",
            } as never)
          : Effect.fail({ _tag: "GitHubCliError" } as never),
  });
  const dependencies = Layer.mergeAll(
    ProjectMachineDiscovery.layer.pipe(Layer.provide(projects)),
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

describe("CloudSessionMachines.resolve", () => {
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
        ".nexi/machine.json": JSON.stringify({
          version: 1,
          devcontainer: ".devcontainer/devcontainer.json",
          secrets: [
            { name: "NPM_TOKEN", scope: "team" },
            { name: "MY_KEY", scope: "user" },
          ],
        }),
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
