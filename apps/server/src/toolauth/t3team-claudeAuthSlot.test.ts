// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as ProcessRunner from "../processRunner.ts";
import { CLAUDE, CODEX } from "./t3team-adapters.ts";
import { holdsClaudeRefreshToken, probeToolStatus } from "./t3team-claudeAuthSlot.ts";
import type { ToolAuthAdapter } from "./t3team-types.ts";

const SLOT_ON = { T3CODE_CLAUDE_AUTH_SLOT: "1" };
const DUMMY_LOGIN = { claudeAiOauth: { accessToken: "a", refreshToken: "r", expiresAt: 1 } };

/** Every test gets its own scratch home — never the real `~/.claude`. */
function makeTempHome(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-claude-auth-slot-"));
}

function writeFile(path: string, text: string): void {
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, text);
}

/** Records every spawn, answering as a signed-in Claude would. */
function recordingRunner(spawned: Array<string>): ProcessRunner.ProcessRunner["Service"] {
  return ProcessRunner.ProcessRunner.of({
    run: (input) => {
      spawned.push(input.command);
      return Effect.succeed({
        stdout: '{"loggedIn":true}',
        stderr: "",
        code: null,
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutInvalidUtf8: false,
        stderrInvalidUtf8: false,
      });
    },
  });
}

const status = (
  adapter: ToolAuthAdapter,
  homeDir: string,
  env: NodeJS.ProcessEnv,
  spawned: Array<string>,
) =>
  probeToolStatus(adapter, { homeDir, env, requireProbeAnswer: true }).pipe(
    Effect.provideService(ProcessRunner.ProcessRunner, recordingRunner(spawned)),
  );

describe("holdsClaudeRefreshToken", () => {
  it("is true only for a login that still carries a refresh token", () => {
    expect(holdsClaudeRefreshToken(JSON.stringify(DUMMY_LOGIN))).toBe(true);
    expect(holdsClaudeRefreshToken("")).toBe(false);
    expect(holdsClaudeRefreshToken("{}")).toBe(false);
    expect(holdsClaudeRefreshToken('{"claudeAiOauth":{"refreshToken":""}}')).toBe(false);
    expect(holdsClaudeRefreshToken('{"claudeAiOauth":null}')).toBe(false);
    expect(holdsClaudeRefreshToken("{not json")).toBe(false);
  });
});

it.layer(NodeServices.layer)("Claude status on an auth-slot session", (it) => {
  it.effect("reads the slot in CLAUDE_CONFIG_DIR and never spawns the CLI", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      const configDir = NodePath.join(homeDir, "slot");
      writeFile(NodePath.join(configDir, ".credentials.json"), JSON.stringify(DUMMY_LOGIN));
      const spawned: Array<string> = [];
      const state = yield* status(
        CLAUDE,
        homeDir,
        { ...SLOT_ON, CLAUDE_CONFIG_DIR: configDir },
        spawned,
      );
      expect(state).toEqual({ tool: "claude", phase: "connected" });
      expect(spawned).toEqual([]);
    }),
  );

  it.effect("a missing or emptied slot asks for sign-in, still without spawning the CLI", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      const configDir = NodePath.join(homeDir, "slot");
      const spawned: Array<string> = [];
      const env = { ...SLOT_ON, CLAUDE_CONFIG_DIR: configDir };
      expect((yield* status(CLAUDE, homeDir, env, spawned)).phase).toBe("idle");
      writeFile(NodePath.join(configDir, ".credentials.json"), "{}");
      expect((yield* status(CLAUDE, homeDir, env, spawned)).phase).toBe("idle");
      expect(spawned).toEqual([]);
    }),
  );

  it.effect("without CLAUDE_CONFIG_DIR the slot is ~/.claude", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      writeFile(
        NodePath.join(homeDir, ".claude", ".credentials.json"),
        JSON.stringify(DUMMY_LOGIN),
      );
      const state = yield* status(CLAUDE, homeDir, SLOT_ON, []);
      expect(state.phase).toBe("connected");
    }),
  );

  it.effect("without the session marker, and for other tools, the CLI probe still decides", () =>
    Effect.gen(function* () {
      const homeDir = makeTempHome();
      const spawned: Array<string> = [];
      expect((yield* status(CLAUDE, homeDir, {}, spawned)).phase).toBe("connected");
      const hostFlagOn = { NEXI_FF_CLOUD_CLAUDE_AUTH_SLOT: "on", T3CODE_CLAUDE_AUTH_SLOT: "on" };
      expect((yield* status(CLAUDE, homeDir, hostFlagOn, spawned)).phase).toBe("connected");
      expect((yield* status(CODEX, homeDir, SLOT_ON, spawned)).tool).toBe("codex");
      expect(spawned).toEqual(["claude", "claude", "codex"]);
    }),
  );
});
