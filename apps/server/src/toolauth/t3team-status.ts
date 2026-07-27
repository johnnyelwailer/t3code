/**
 * Answers "is this tool already connected?" without starting a login flow.
 *
 * Two independent signals, combined:
 *   1. The adapter's `probe` command (when declared) -- run with the SAME
 *      environment the interactive login would use, since probe results are
 *      environment-sensitive (`ANTHROPIC_BASE_URL` being set is why `claude
 *      auth status` can report `loggedIn:false` despite a valid Keychain
 *      credential). This wins whenever it runs and produces a parseable
 *      result.
 *   2. Credential-file presence, relative to an injectable home directory --
 *      a HINT only, used when there's no probe or the probe fails to run
 *      (missing binary, non-zero exit with unparseable output, ...).
 *
 * Privacy rule: credential files are read for expiry/account metadata ONLY.
 * `account`/`organization` are narrow, adapter-authored regexes that target
 * specific fields (never the whole blob); the raw file text is never logged,
 * returned, or transmitted, and other fields (access tokens, refresh
 * tokens, ...) are never inspected.
 *
 * @module toolauth/status
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ProcessRunner from "../processRunner.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

export interface ToolAuthStatusOptions {
  /** Test seam: defaults to `os.homedir()` in production. */
  readonly homeDir: string;
  /**
   * Test seam / environment-sensitivity seam: defaults to `process.env` in
   * production. Passed verbatim to the probe command.
   */
  readonly env: NodeJS.ProcessEnv;
}

const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000;
const MS_EPOCH_THRESHOLD = 1_000_000_000_000;

function resolveDotPath(record: unknown, dotPath: string): unknown {
  let cursor: unknown = record;
  for (const segment of dotPath.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Normalizes epoch-seconds, epoch-ms, or an ISO string into epoch-ms. */
function normalizeExpiry(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < MS_EPOCH_THRESHOLD ? raw * 1000 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function parseCredentialExpiry(adapter: ToolAuthAdapter, fileText: string): number | undefined {
  const dotPath = adapter.status.credentialExpiryPath;
  if (!dotPath) return undefined;
  try {
    const parsed: unknown = JSON.parse(fileText);
    return normalizeExpiry(resolveDotPath(parsed, dotPath));
  } catch {
    return undefined;
  }
}

function extractLabel(pattern: RegExp | undefined, text: string): string | undefined {
  if (!pattern || text.length === 0) return undefined;
  return pattern.exec(text)?.[1]?.trim() || undefined;
}

/**
 * Downgrades a stale "connected" to "expired", and attaches a heads-up
 * message once expiry is within `EXPIRY_WARNING_MS` -- warn before expiry
 * rather than only after. Takes `now` as a parameter (from `DateTime.now`,
 * not `Date.now()`) so this stays a plain, effect-free function.
 */
function applyExpiry(state: AuthState, now: number): AuthState {
  if (state.phase !== "connected" || state.expiresAt === undefined) return state;
  if (state.expiresAt <= now) {
    return { ...state, phase: "expired", message: state.message ?? "Credential has expired." };
  }
  if (state.expiresAt - now <= EXPIRY_WARNING_MS) {
    const days = Math.max(1, Math.ceil((state.expiresAt - now) / (24 * 60 * 60 * 1000)));
    return {
      ...state,
      message: state.message ?? `Expires in ${days} day${days === 1 ? "" : "s"} — reconnect soon.`,
    };
  }
  return state;
}

export const probeStatus = Effect.fn("toolauth.probeStatus")(function* (
  adapter: ToolAuthAdapter,
  options: ToolAuthStatusOptions,
): Effect.fn.Return<
  AuthState,
  never,
  ProcessRunner.ProcessRunner | FileSystem.FileSystem | Path.Path
> {
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const credentialFilePath = path.join(options.homeDir, adapter.status.credentialPath);

  const credentialFileText = yield* fileSystem
    .readFileString(credentialFilePath)
    .pipe(Effect.option);

  let phase: AuthState["phase"] | undefined;
  let probeOutput = "";

  if (adapter.status.probe && adapter.status.probe.length > 0) {
    const processRunner = yield* ProcessRunner.ProcessRunner;
    const [command, ...args] = adapter.status.probe;
    const probeResult = yield* processRunner
      .run({
        command: command!,
        args,
        env: options.env,
        timeout: "10 seconds",
        maxOutputBytes: 65_536,
        outputMode: "truncate",
        timeoutBehavior: "timedOutResult",
      })
      .pipe(Effect.option);

    if (Option.isSome(probeResult) && !probeResult.value.timedOut) {
      probeOutput = probeResult.value.stdout.length > 0
        ? probeResult.value.stdout
        : probeResult.value.stderr;
      const parsed = adapter.status.parseProbe?.(probeOutput);
      if (parsed) phase = parsed;
    }
  }

  // The probe didn't resolve a phase (none declared, it failed to run, or its
  // output didn't parse) — fall back to the credential-file hint.
  if (phase === undefined) {
    phase = Option.isSome(credentialFileText) ? "connected" : "idle";
  }

  // "No OAuth credential" is not the same as "not usable". A gateway base URL,
  // an API key or a pre-issued token makes the CLI work with no sign-in at all,
  // and asking such a user to Connect offers them nothing to fix.
  //
  // Verified live: with ANTHROPIC_BASE_URL set, `claude auth status --json`
  // reports loggedIn:false while the Claude provider is healthy and serving
  // models. Only `idle` is reclaimed here — a genuinely `expired` or `failed`
  // OAuth session still deserves to be surfaced as-is.
  const nonOAuthEnvVar = adapter.status.nonOAuthEnvVars?.find((name) => {
    const value = options.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
  if (phase === "idle" && nonOAuthEnvVar !== undefined) {
    return {
      tool: adapter.tool,
      phase: "connected",
      // Deliberately says "configured", not "verified". Presence of the env var
      // is all we know: validating a gateway URL or API key would mean issuing a
      // billable request, so a revoked or malformed key still reads as connected
      // here. Wording it as configured-not-checked keeps the claim honest, and
      // the first real call surfaces the truth either way.
      message: `Configured via ${nonOAuthEnvVar} — no sign-in needed (not verified).`,
    };
  }

  // account/organization are kept SEPARATE (never joined into one string):
  // they are independent facts the CLI may or may not report, and mashing
  // them together is exactly how an unrelated field (authMethod, apiProvider,
  // ...) ends up misread as part of an "account".
  const labelSourceText =
    probeOutput.length > 0
      ? probeOutput
      : Option.getOrElse(credentialFileText, () => "");
  const account = extractLabel(adapter.status.account, labelSourceText);
  const organization = extractLabel(adapter.status.organization, labelSourceText);

  const expiresAt = Option.isSome(credentialFileText)
    ? parseCredentialExpiry(adapter, credentialFileText.value)
    : undefined;

  const state: AuthState = {
    tool: adapter.tool,
    phase,
    ...(account !== undefined ? { account } : {}),
    ...(organization !== undefined ? { organization } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };

  const now = yield* DateTime.now;
  return applyExpiry(state, DateTime.toEpochMillis(now));
});
