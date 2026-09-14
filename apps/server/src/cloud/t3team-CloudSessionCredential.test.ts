import { assert, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcessSpawner } from "effect/unstable/process";

import { CloudSessionFailedError } from "@t3tools/contracts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as Credential from "./t3team-CloudSessionCredential.ts";
import type { CloudSessionRepoRef, GhInvocation } from "./t3team-githubActionsSessionClient.ts";

const REF: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const TOKEN: CliTokenManager.PersistedToken = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAtEpochMs: 9_999_999_999_999,
  identity: "me@nexplore.ch",
};

const ghOut = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

const FLAG = Credential.SESSION_CREDENTIAL_ISSUE_FLAG_ENV;

/** Pin the handoff flag for one effect (undefined = unset = default ON). */
const pinFlag = (flag: string | undefined) =>
  Effect.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({ env: flag === undefined ? {} : { [FLAG]: flag } }),
    ),
  );

type RecordedCall = { args: readonly string[]; stdin?: string | undefined };

/** A fake gh executor that records every invocation and answers from a config. */
const makeFakeRun = (behavior: {
  readonly createResult?: VcsProcess.VcsProcessOutput;
  readonly createError?: CloudSessionFailedError;
}): { run: Credential.CredentialGhExecutor; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = [];
  const run: Credential.CredentialGhExecutor = (invocation: GhInvocation) => {
    calls.push({ args: invocation.args, stdin: invocation.stdin });
    if (behavior.createError !== undefined) return Effect.fail(behavior.createError);
    return Effect.succeed(behavior.createResult ?? ghOut(JSON.stringify({ number: 42 })));
  };
  return { run, calls };
};

describe("payload issue protocol", () => {
  it("keys the payload issue title by the dispatch tag", () => {
    expect(Credential.payloadIssueTitle("c9f4a2")).toBe("nexi-session payload [c9f4a2]");
  });

  it("creates the payload issue by POSTing title and body on stdin, never argv", () => {
    const invocation = Credential.createPayloadIssueInvocation(REF, {
      title: Credential.payloadIssueTitle("c9f4a2"),
      body: "ZXg=",
    });
    expect(invocation.args).toEqual([
      "api",
      "--hostname",
      "nexplore.ghe.com",
      "repos/hive/nx-nexi/issues",
      "--method",
      "POST",
      "--input",
      "-",
    ]);
    expect(JSON.parse(invocation.stdin ?? "")).toEqual({
      title: "nexi-session payload [c9f4a2]",
      body: "ZXg=",
    });
    // The credential body must never appear in the argument vector.
    expect(invocation.args.join(" ")).not.toContain("ZXg=");
  });

  it("encodes the payload as base64 of the full PersistedToken JSON (refresh token kept)", () => {
    const body = Credential.sessionCredentialPayloadBody(TOKEN);
    expect(Buffer.from(body, "base64").toString("utf8")).toBe(JSON.stringify(TOKEN));
  });

  it("reads the issue number from a create response, null when unreadable", () => {
    expect(Credential.parseCreatedIssueNumber(JSON.stringify({ number: 42 }))).toBe(42);
    expect(Credential.parseCreatedIssueNumber("not json")).toBeNull();
    expect(Credential.parseCreatedIssueNumber(JSON.stringify({}))).toBeNull();
  });
});

describe("isSessionCredentialIssueEnabled", () => {
  it.effect("is ON by default and maps raw values (1/true on, 0/false off)", () =>
    Effect.gen(function* () {
      const read = (flag: string | undefined) =>
        Credential.isSessionCredentialIssueEnabled().pipe(pinFlag(flag));
      assert.isTrue(yield* read(undefined));
      assert.isTrue(yield* read("1"));
      assert.isTrue(yield* read("true"));
      assert.isTrue(yield* read("TRUE"));
      assert.isFalse(yield* read("0"));
      assert.isFalse(yield* read("false"));
      assert.isFalse(yield* read("false "));
    }),
  );
});

describe("runCredentialHandoff", () => {
  it.effect(
    "creates the payload issue with the exact title and body when a credential exists",
    () =>
      Effect.gen(function* () {
        const { run, calls } = makeFakeRun({ createResult: ghOut(JSON.stringify({ number: 42 })) });
        yield* Credential.runCredentialHandoff({
          repoRef: REF,
          sessionTag: "c9f4a2",
          run,
          enabled: true,
          readCredential: Effect.succeed(Option.some(TOKEN)),
        });
        assert.equal(calls.length, 1);
        assert.include([...(calls[0]?.args ?? [])], "repos/hive/nx-nexi/issues");
        const parsed = JSON.parse(calls[0]?.stdin ?? "{}") as { title: string; body: string };
        assert.equal(parsed.title, "nexi-session payload [c9f4a2]");
        assert.equal(parsed.body, Credential.sessionCredentialPayloadBody(TOKEN));
      }),
  );

  it.effect(
    "fails with connect_sign_in_required when no credential is available (no issue write)",
    () =>
      Effect.gen(function* () {
        const { run, calls } = makeFakeRun({});
        const result = yield* Effect.result(
          Credential.runCredentialHandoff({
            repoRef: REF,
            sessionTag: "c9f4a2",
            run,
            enabled: true,
            readCredential: Effect.succeed(Option.none()),
          }),
        );
        assert.isTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assert.equal(result.failure.reason, "connect_sign_in_required");
          assert.equal(result.failure.message, Credential.CONNECT_SIGN_IN_REQUIRED_TEXT);
        }
        assert.equal(calls.length, 0);
      }),
  );

  it.effect("treats an unreadable credential as sign-in-required (no issue write)", () =>
    Effect.gen(function* () {
      const { run, calls } = makeFakeRun({});
      const result = yield* Effect.result(
        Credential.runCredentialHandoff({
          repoRef: REF,
          sessionTag: "c9f4a2",
          run,
          enabled: true,
          readCredential: Effect.fail(
            new CliTokenManager.CloudCliCredentialReadError({ cause: new Error("boom") }),
          ),
        }),
      );
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) assert.equal(result.failure.reason, "connect_sign_in_required");
      assert.equal(calls.length, 0);
    }),
  );

  it.effect("fails with payload_issue_failed when the issue write errors", () =>
    Effect.gen(function* () {
      const { run, calls } = makeFakeRun({
        createError: new CloudSessionFailedError({ reason: "rejected", message: "gh: HTTP 403" }),
      });
      const result = yield* Effect.result(
        Credential.runCredentialHandoff({
          repoRef: REF,
          sessionTag: "c9f4a2",
          run,
          enabled: true,
          readCredential: Effect.succeed(Option.some(TOKEN)),
        }),
      );
      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.equal(result.failure.reason, "payload_issue_failed");
        assert.equal(result.failure.message, Credential.PAYLOAD_ISSUE_FAILED_TEXT);
      }
      assert.equal(calls.length, 1);
    }),
  );

  it.effect("skips the whole handoff when the flag is off (no gh call)", () =>
    Effect.gen(function* () {
      const { run, calls } = makeFakeRun({});
      yield* Credential.runCredentialHandoff({
        repoRef: REF,
        sessionTag: "c9f4a2",
        run,
        enabled: false,
        readCredential: Effect.succeed(Option.some(TOKEN)),
      });
      assert.equal(calls.length, 0);
    }),
  );
});
