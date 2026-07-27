// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { TestClock } from "effect/testing";

import * as ProcessRunner from "../processRunner.ts";
import { CLAUDE, CODEX, FAKE } from "./t3team-adapters.ts";
import { probeStatus } from "./t3team-status.ts";

/** Every test gets its own scratch `$HOME` — never the real `~/.claude` or `~/.codex`. */
function makeTempHome(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-toolauth-status-"));
}

function removeTempHome(homeDir: string): void {
  NodeFS.rmSync(homeDir, { recursive: true, force: true });
}

/** Plain (non-Effect) helper: serializes and writes, kept outside any generator body. */
function writeCredentialFile(homeDir: string, relativePath: string, value: unknown): void {
  const fullPath = NodePath.join(homeDir, relativePath);
  NodeFS.mkdirSync(NodePath.dirname(fullPath), { recursive: true });
  NodeFS.writeFileSync(fullPath, JSON.stringify(value));
}

// The one bridge from real wall-clock time into TestClock.setTime for these tests.
/** Plain (non-Effect) helper so `Date.now()` never appears inside a generator body. */
function realNowMs(): number {
  // @effect-diagnostics-next-line globalDate:off
  return Date.now();
}

const stubProcessRunner = (
  run: ProcessRunner.ProcessRunner["Service"]["run"],
): ProcessRunner.ProcessRunner["Service"] => ProcessRunner.ProcessRunner.of({ run });

/** Serializes internally so call sites never need a bare `JSON.stringify` of their own. */
const okJsonResult = (payload: unknown): ReturnType<ProcessRunner.ProcessRunner["Service"]["run"]> =>
  Effect.succeed({
    stdout: JSON.stringify(payload),
    stderr: "",
    code: 0,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
  } as ProcessRunner.ProcessRunOutput);

const okTextResult = (stdout: string): ReturnType<ProcessRunner.ProcessRunner["Service"]["run"]> =>
  Effect.succeed({
    stdout,
    stderr: "",
    code: 0,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
  } as ProcessRunner.ProcessRunOutput);

const probe = (
  adapter: typeof CLAUDE,
  homeDir: string,
  run: ProcessRunner.ProcessRunner["Service"]["run"],
  /** Empty by default so tests never inherit the machine's real gateway/API-key vars. */
  env: NodeJS.ProcessEnv = {},
) =>
  probeStatus(adapter, { homeDir, env }).pipe(
    Effect.provideService(ProcessRunner.ProcessRunner, stubProcessRunner(run)),
  );

const probeSpawnFailure = new ProcessRunner.ProcessSpawnError({
  command: "claude",
  argumentCount: 3,
  cause: new Error("ENOENT"),
});

it.layer(NodeServices.layer)("toolauth status probe", (it) => {
  describe("Claude — probe wins over the credential-file hint", () => {
    it.effect(
      "loggedIn:true reports connected, and never mistakes authMethod/apiProvider for an account",
      () =>
        Effect.gen(function* () {
          const homeDir = makeTempHome();
          try {
            // The real, verified `claude auth status --json` shape carries no
            // account/organization field at all — only these two. Neither
            // must ever surface as `state.account`/`state.organization`.
            const state = yield* probe(CLAUDE, homeDir, () =>
              okJsonResult({ loggedIn: true, authMethod: "claudeai", apiProvider: "firstParty" }),
            );
            expect(state.phase).toBe("connected");
            expect(state.account).toBeUndefined();
            expect(state.organization).toBeUndefined();
          } finally {
            removeTempHome(homeDir);
          }
        }),
    );

    it.effect("extracts account and organization as independent fields, never joined", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          // The `account`/`organization` regexes target these exact key
          // names (see the UNVERIFIED note on CLAUDE.status in adapters.ts —
          // the real authenticated shape has not been confirmed). This
          // exercises the extraction mechanism itself, not the real CLI shape.
          const state = yield* probe(CLAUDE, homeDir, () =>
            okJsonResult({ loggedIn: true, account: "jane@example.com", organization: "Acme Corp" }),
          );
          expect(state.phase).toBe("connected");
          expect(state.account).toBe("jane@example.com");
          expect(state.organization).toBe("Acme Corp");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("loggedIn:false reports idle even when a stale credential file exists", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          writeCredentialFile(homeDir, CLAUDE.status.credentialPath, { expiresAt: 0 });
          const state = yield* probe(CLAUDE, homeDir, () =>
            okJsonResult({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" }),
          );
          expect(state.phase).toBe("idle");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("falls back to the credential-file hint when the probe command fails to run", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          // `@effect/vitest`'s default TestClock starts at epoch 0, not real
          // time — normalizeExpiry's epoch-seconds-vs-ms heuristic only makes
          // sense against a realistic instant, so pin the virtual clock to
          // the real "now" before computing expiry offsets against it.
          yield* TestClock.setTime(realNowMs());
          const now = yield* Clock.currentTimeMillis;
          writeCredentialFile(homeDir, CLAUDE.status.credentialPath, {
            expiresAt: now + 30 * 24 * 60 * 60 * 1000,
          });
          const state = yield* probe(CLAUDE, homeDir, () => Effect.fail(probeSpawnFailure));
          expect(state.phase).toBe("connected");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("falls back to idle when the probe fails and no credential file exists", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const state = yield* probe(CLAUDE, homeDir, () => Effect.fail(probeSpawnFailure));
          expect(state.phase).toBe("idle");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("downgrades a stale credential to expired regardless of what the probe reported", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          yield* TestClock.setTime(realNowMs());
          const now = yield* Clock.currentTimeMillis;
          writeCredentialFile(homeDir, CLAUDE.status.credentialPath, { expiresAt: now - 60_000 });
          const state = yield* probe(CLAUDE, homeDir, () =>
            okJsonResult({ loggedIn: true, authMethod: "claudeai", apiProvider: "firstParty" }),
          );
          expect(state.phase).toBe("expired");
          expect(state.message).toBeDefined();
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("warns ahead of expiry rather than only after it", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          yield* TestClock.setTime(realNowMs());
          const now = yield* Clock.currentTimeMillis;
          writeCredentialFile(homeDir, CLAUDE.status.credentialPath, {
            expiresAt: now + 2 * 24 * 60 * 60 * 1000,
          });
          const state = yield* probe(CLAUDE, homeDir, () =>
            okJsonResult({ loggedIn: true, authMethod: "claudeai", apiProvider: "firstParty" }),
          );
          expect(state.phase).toBe("connected");
          expect(state.message).toMatch(/expires in \d+ day/i);
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("does not warn when expiry is comfortably far out", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          yield* TestClock.setTime(realNowMs());
          const now = yield* Clock.currentTimeMillis;
          writeCredentialFile(homeDir, CLAUDE.status.credentialPath, {
            expiresAt: now + 30 * 24 * 60 * 60 * 1000,
          });
          const state = yield* probe(CLAUDE, homeDir, () =>
            okJsonResult({ loggedIn: true, authMethod: "claudeai", apiProvider: "firstParty" }),
          );
          expect(state.phase).toBe("connected");
          expect(state.message).toBeUndefined();
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });

  describe("a non-OAuth path counts as usable — don't nag someone with nothing to fix", () => {
    it.effect("ANTHROPIC_BASE_URL set: loggedIn:false is reported as connected, not idle", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          // The exact live situation: the CLI is pointed at a gateway, holds no
          // OAuth credential, and the provider is healthy and serving models.
          const state = yield* probe(
            CLAUDE,
            homeDir,
            () => okTextResult('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}'),
            { ANTHROPIC_BASE_URL: "https://gateway.example.invalid" },
          );
          expect(state.phase).toBe("connected");
          expect(state.message).toContain("ANTHROPIC_BASE_URL");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("an empty env var does not count as a usable non-OAuth path", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const state = yield* probe(
            CLAUDE,
            homeDir,
            () => okTextResult('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}'),
            { ANTHROPIC_BASE_URL: "   " },
          );
          expect(state.phase).toBe("idle");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });

  describe("Codex — verbatim probe output", () => {
    it.effect('"Logged in using ChatGPT" reports connected, and NOT "ChatGPT" as an account', () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const state = yield* probe(CODEX, homeDir, () => okTextResult("Logged in using ChatGPT"));
          expect(state.phase).toBe("connected");
          // "ChatGPT" is the auth METHOD, not an account name. Capturing it
          // rendered "Signed in as ChatGPT" in the UI — the same mislabeling
          // already removed for Claude's authMethod/apiProvider. A plain
          // "Connected" is the honest rendering.
          expect(state.account).toBeUndefined();
          expect(state.organization).toBeUndefined();
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("reports idle when the probe has no credential-file hint either", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const state = yield* probe(CODEX, homeDir, () => okTextResult("You are not logged in"));
          expect(state.phase).toBe("idle");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });

  describe("an adapter with no probe at all (credential file is the only signal)", () => {
    // FAKE declares no `status.probe`, so ProcessRunner is never actually
    // called — still provided (and set to die if it were) since probeStatus's
    // effect type statically requires the service regardless of that runtime
    // branch.
    const dyingProcessRunner = stubProcessRunner(() =>
      Effect.die("ProcessRunner should not be called for an adapter with no probe"),
    );

    it.effect("reports connected when the credential file is present", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          writeCredentialFile(homeDir, FAKE.status.credentialPath, {});
          const state = yield* probeStatus(FAKE, { homeDir, env: {} }).pipe(
            Effect.provideService(ProcessRunner.ProcessRunner, dyingProcessRunner),
          );
          expect(state.phase).toBe("connected");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );

    it.effect("reports idle when the credential file is absent", () =>
      Effect.gen(function* () {
        const homeDir = makeTempHome();
        try {
          const state = yield* probeStatus(FAKE, { homeDir, env: {} }).pipe(
            Effect.provideService(ProcessRunner.ProcessRunner, dyingProcessRunner),
          );
          expect(state.phase).toBe("idle");
        } finally {
          removeTempHome(homeDir);
        }
      }),
    );
  });
});
