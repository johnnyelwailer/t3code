import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ClaudeSettings, ProviderInstanceId, type ProviderAuthState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as HostProcess from "@t3tools/shared/HostProcess";
import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { resolveClaudeHomePath } from "./ClaudeHome.ts";
import { claudeSignInSetup, makeClaudeAuth } from "./t3team-ClaudeAuth.ts";

const decodeSettings = Schema.decodeSync(ClaudeSettings);
const instanceId = ProviderInstanceId.make("claudeAgent3");
const encoder = new TextEncoder();
const LOGGED_IN = { stdout: '{"loggedIn":true,"authMethod":"claude.ai"}', code: 0 };
const LOGGED_OUT = { stdout: '{"loggedIn":false}', code: 1 };

const makeHarness = Effect.fn("t3team-ClaudeAuth.test.makeHarness")(function* (
  input: {
    readonly homePath?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly status?: { readonly stdout: string; readonly code: number };
  } = {},
) {
  const config = decodeSettings({ binaryPath: "claude", homePath: input.homePath ?? "" });
  const processEnv = input.env ?? { PATH: "/tools" };
  const configDir = yield* resolveClaudeHomePath(config, processEnv);
  const changed: string[] = [];
  const commands: Array<{ args: ReadonlyArray<string>; env: Record<string, string | undefined> }> =
    [];
  const ptySpawns: PtyAdapter.PtySpawnInput[] = [];
  const madeDirectories: string[] = [];
  let data: ((chunk: string) => void) | undefined;
  let exit: ((event: PtyAdapter.PtyExitEvent) => void) | undefined;
  let killed = false;
  const written: string[] = [];

  const spawner = ChildProcessSpawner.make((command) => {
    if (!ChildProcess.isStandardCommand(command)) return Effect.die("unexpected piped command");
    commands.push({ args: command.args, env: command.options.env ?? {} });
    const result =
      command.args[1] === "status" ? (input.status ?? LOGGED_IN) : { stdout: "", code: 0 };
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.make(encoder.encode(result.stdout)),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      }),
    );
  });

  const controller = yield* makeClaudeAuth({
    instanceId,
    config,
    processEnv,
    configDir,
    onChanged: Effect.sync(() => {
      changed.push("changed");
    }),
  }).pipe(
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        makeDirectory: (path) =>
          Effect.sync(() => {
            madeDirectories.push(path);
          }),
      }),
    ),
    Effect.provideService(PtyAdapter.PtyAdapter, {
      spawn: (spawn) =>
        Effect.sync(() => {
          ptySpawns.push(spawn);
          return {
            pid: 123,
            write: (value) => {
              written.push(value);
            },
            resize: () => {},
            kill: () => {
              killed = true;
            },
            onData: (callback) => {
              data = callback;
              return () => {
                data = undefined;
              };
            },
            onExit: (callback) => {
              exit = callback;
              return () => {
                exit = undefined;
              };
            },
          };
        }),
    }),
  );

  const state = (predicate: (state: ProviderAuthState) => boolean) =>
    controller
      .subscribe("owner")
      .pipe(Stream.filter(predicate), Stream.runHead, Effect.map(Option.getOrThrow));
  const phase = (phase: ProviderAuthState["phase"]) => state((value) => value.phase === phase);
  yield* state((value) => (value.methods?.length ?? 0) > 0);
  return {
    controller,
    configDir,
    changed,
    commands,
    ptySpawns,
    madeDirectories,
    written,
    phase,
    state,
    emit: (chunk: string) => data?.(chunk),
    exit: (exitCode: number) => exit?.({ exitCode, signal: null }),
    killed: () => killed,
  };
});

const inHost = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.scoped,
    Effect.provideService(HostProcess.Platform, "linux"),
    Effect.provide(NodeServices.layer),
  );

it.effect("logs in to the config directory of an instance that sets homePath", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const h = yield* makeHarness({ homePath: path.join("work", "claude-3") });
    yield* h.controller.start("owner");
    yield* h.phase("waiting");
    const spawn = h.ptySpawns[0];
    assert.strictEqual(h.configDir, path.resolve("work", "claude-3"));
    assert.strictEqual(spawn?.env.CLAUDE_CONFIG_DIR, h.configDir);
    assert.strictEqual(spawn?.cwd, h.configDir);
    assert.deepEqual(h.madeDirectories, [h.configDir]);
    assert.strictEqual(spawn?.shell, "claude");
    assert.deepEqual([spawn?.cols, spawn?.rows], [200, 30]);
  }).pipe(inHost),
);

it.effect("logs in to the config directory an instance receives through its environment", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const dir = path.resolve("work", "claude-env");
    const h = yield* makeHarness({ env: { PATH: "/tools", CLAUDE_CONFIG_DIR: dir } });
    yield* h.controller.start("owner");
    yield* h.phase("waiting");
    assert.strictEqual(h.ptySpawns[0]?.env.CLAUDE_CONFIG_DIR, dir);
    assert.strictEqual(h.ptySpawns[0]?.env.PATH, "/tools");
  }).pipe(inHost),
);

it.effect(
  "serialises instances that share a config directory, whatever its casing on Windows",
  () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const upper = yield* makeHarness({ homePath: path.resolve("Work", "Claude") });
      const lower = yield* makeHarness({ homePath: path.resolve("work", "claude") });
      const other = yield* makeHarness({ homePath: path.resolve("work", "claude-2") });
      assert.deepEqual(upper.controller.credentialBinding, lower.controller.credentialBinding);
      assert.notDeepEqual(upper.controller.credentialBinding, other.controller.credentialBinding);
      assert.strictEqual(upper.controller.credentialBinding?.owner, "provider");
    }).pipe(Effect.provideService(HostProcess.Platform, "win32"), inHost),
);

it.effect("keeps config directories that differ only by case separate on Linux", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const upper = yield* makeHarness({ homePath: path.resolve("Work", "Claude") });
    const lower = yield* makeHarness({ homePath: path.resolve("work", "claude") });
    assert.notDeepEqual(upper.controller.credentialBinding, lower.controller.credentialBinding);
  }).pipe(inHost),
);

it.effect("starts the login command that matches the chosen method", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude" });
    const methods = (yield* h.state((value) => (value.methods?.length ?? 0) > 0)).methods ?? [];
    assert.deepEqual(
      methods.map((method) => [method.id, method.type]),
      [
        ["claudeai", "terminal"],
        ["console", "terminal"],
        ["sso", "terminal"],
      ],
    );
    const launched: Array<ReadonlyArray<string> | undefined> = [];
    for (const methodId of [undefined, "console", "sso"]) {
      const flow = yield* h.controller.start("owner", Effect.void, methodId);
      yield* h.phase("waiting");
      launched.push(h.ptySpawns.at(-1)?.args);
      yield* h.controller.cancel("owner", flow.flowId!);
    }
    assert.deepEqual(launched, [
      ["auth", "login", "--claudeai"],
      ["auth", "login", "--console"],
      ["auth", "login", "--sso"],
    ]);
  }).pipe(inHost),
);

it.effect("verifies the login with the same environment and reports a change on success", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude" });
    yield* h.controller.start("owner");
    yield* h.phase("waiting");
    h.emit("Open https://claude.ai/oauth/authorize?code=true to sign in");
    yield* h.state(
      (value) =>
        value.interaction?.type === "terminal" &&
        value.interaction.output.includes("https://claude.ai"),
    );
    h.exit(0);
    yield* h.phase("succeeded");
    assert.isTrue(h.killed());
    assert.deepEqual(h.changed, ["changed"]);
    const status = h.commands.find((command) => command.args[1] === "status");
    assert.deepEqual(status?.args, ["auth", "status", "--json"]);
    assert.strictEqual(status?.env.CLAUDE_CONFIG_DIR, h.configDir);
  }).pipe(inHost),
);

it.effect("forwards typed input, such as a pasted code, to the login terminal", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude" });
    const flow = yield* h.controller.start("owner");
    yield* h.phase("waiting");
    yield* h.controller.respond!("owner", {
      instanceId,
      flowId: flow.flowId!,
      interactionId: "terminal",
      response: { type: "terminal", data: "abc-123\r" },
    });
    assert.deepEqual(h.written, ["abc-123\r"]);
  }).pipe(inHost),
);

it.effect("fails without reporting a change when the login command exits non-zero", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude" });
    yield* h.controller.start("owner");
    yield* h.phase("waiting");
    h.exit(1);
    const failed = yield* h.phase("failed");
    assert.strictEqual(failed.message, "The Claude login did not finish successfully.");
    assert.deepEqual(h.changed, []);
    assert.isFalse(h.commands.some((command) => command.args[1] === "status"));
  }).pipe(inHost),
);

it.effect("fails when the login exits cleanly but Claude still reports signed out", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude", status: LOGGED_OUT });
    yield* h.controller.start("owner");
    yield* h.phase("waiting");
    h.exit(0);
    yield* h.phase("failed");
    assert.deepEqual(h.changed, []);
  }).pipe(inHost),
);

it.effect("kills the login process when the sign-in is cancelled", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude" });
    const flow = yield* h.controller.start("owner");
    yield* h.phase("waiting");
    assert.isFalse(h.killed());
    yield* h.controller.cancel("owner", flow.flowId!);
    assert.isTrue(h.killed());
    assert.deepEqual(h.changed, []);
  }).pipe(inHost),
);

it.effect("refuses to sign in or out of an instance that uses its own credentials", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({
      homePath: "work/claude",
      env: { PATH: "/tools", ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    yield* h.controller.start("owner");
    const failed = yield* h.phase("failed");
    assert.include(failed.message, "no account to sign in to");
    const logout = yield* h.controller.logout(Effect.void).pipe(Effect.result);
    assert.strictEqual(logout._tag, "Failure");
    assert.deepEqual(h.ptySpawns, []);
    assert.deepEqual(h.commands, []);
    assert.deepEqual(h.changed, []);
  }).pipe(inHost),
);

it.effect("signs out with the instance environment and reports a change", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness({ homePath: "work/claude" });
    yield* h.controller.logout(Effect.void);
    const logout = h.commands.find((command) => command.args[1] === "logout");
    assert.deepEqual(logout?.args, ["auth", "logout"]);
    assert.strictEqual(logout?.env.CLAUDE_CONFIG_DIR, h.configDir);
    assert.deepEqual(h.changed, ["changed"]);
  }).pipe(inHost),
);

const setupFor = (processEnv: NodeJS.ProcessEnv, homePath = "") =>
  claudeSignInSetup({
    config: { homePath },
    processEnv,
    isAbsolute: (candidate) => candidate.startsWith("/"),
  });

it("offers sign-in only to instances that do not bring their own credentials", () => {
  assert.deepEqual(setupFor({ PATH: "/tools" }), { canAuthenticate: true, canInstall: false });
  assert.isTrue(setupFor({ ANTHROPIC_API_KEY: "" }).canAuthenticate);
  for (const env of [
    { ANTHROPIC_API_KEY: "sk-ant-test" },
    { ANTHROPIC_AUTH_TOKEN: "router-token", ANTHROPIC_API_KEY: "" },
    { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    { CLAUDE_CODE_OAUTH_TOKEN: "oauth-token" },
  ]) {
    assert.isFalse(setupFor(env).canAuthenticate);
  }
});

it("offers sign-in for a config directory only when the probe and login resolve it identically", () => {
  assert.isFalse(setupFor({ CLAUDE_CONFIG_DIR: "work/claude-3" }).canAuthenticate);
  assert.isTrue(setupFor({ CLAUDE_CONFIG_DIR: "/home/me/.claude-3" }).canAuthenticate);
  assert.isTrue(setupFor({ CLAUDE_CONFIG_DIR: "" }).canAuthenticate);
  assert.isTrue(
    setupFor({ CLAUDE_CONFIG_DIR: "work/claude-3" }, "/home/me/.claude-3").canAuthenticate,
  );
});
