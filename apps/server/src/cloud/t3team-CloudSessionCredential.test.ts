import { assert, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { CloudSessionFailedError } from "@t3tools/contracts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as Credential from "./t3team-CloudSessionCredential.ts";
import type {
  CloudSessionRepoRef,
  GitHubActionsRequest,
  GitHubActionsResponse,
} from "./t3team-githubActionsSessionClient.ts";

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

const answer = (body: string): GitHubActionsResponse => ({ body, truncated: false });

/** JSON shapes the fake host emits; encoded through effect/Schema. */
const GitHubIssueCreateJson = Schema.Struct({ number: Schema.Number });
const encodeGitHubIssueCreate = Schema.encodeSync(Schema.fromJsonString(GitHubIssueCreateJson));

const FLAG = Credential.SESSION_CREDENTIAL_ISSUE_FLAG_ENV;

/** Pin the handoff flag for one effect (undefined = unset = default ON). */
const pinFlag = (flag: string | undefined) =>
  Effect.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({ env: flag === undefined ? {} : { [FLAG]: flag } }),
    ),
  );

/** A fake executor that records every request and answers from a config. */
const makeFakeRun = (behavior: {
  readonly createResult?: GitHubActionsResponse;
  readonly createError?: CloudSessionFailedError;
}): { run: Credential.CredentialGhExecutor; calls: GitHubActionsRequest[] } => {
  const calls: GitHubActionsRequest[] = [];
  const run: Credential.CredentialGhExecutor = (request: GitHubActionsRequest) => {
    calls.push(request);
    if (behavior.createError !== undefined) return Effect.fail(behavior.createError);
    return Effect.succeed(behavior.createResult ?? answer(JSON.stringify({ number: 42 })));
  };
  return { run, calls };
};

describe("payload issue protocol", () => {
  it("keys the payload issue title by the dispatch tag", () => {
    expect(Credential.payloadIssueTitle("c9f4a2")).toBe("nexi-session payload [c9f4a2]");
  });

  it("creates the payload issue by POSTing title and body in the body, never the path", () => {
    const request = Credential.createPayloadIssueRequest(REF, {
      title: Credential.payloadIssueTitle("c9f4a2"),
      body: "ZXg=",
    });
    expect(request).toEqual({
      kind: "rest",
      operation: "cloudSession.createPayloadIssue",
      method: "POST",
      path: "repos/hive/nx-nexi/issues",
      body: { title: "nexi-session payload [c9f4a2]", body: "ZXg=" },
    });
    // The credential body must never appear in the request path.
    expect(request.kind === "rest" ? request.path : "").not.toContain("ZXg=");
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
        const { run, calls } = makeFakeRun({
          createResult: answer(encodeGitHubIssueCreate({ number: 42 })),
        });
        yield* Credential.runCredentialHandoff({
          repoRef: REF,
          sessionTag: "c9f4a2",
          run,
          enabled: true,
          readCredential: Effect.succeed(Option.some(TOKEN)),
        });
        assert.equal(calls.length, 1);
        const call = calls[0];
        assert.isTrue(call?.kind === "rest");
        if (call?.kind !== "rest") return;
        assert.equal(call.path, "repos/hive/nx-nexi/issues");
        const sent = call.body as { title: string; body: string };
        assert.equal(sent.title, "nexi-session payload [c9f4a2]");
        assert.equal(sent.body, Credential.sessionCredentialPayloadBody(TOKEN));
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
        createError: new CloudSessionFailedError({
          reason: "rejected",
          message: "GitHub returned HTTP 403.",
        }),
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

  it.effect("skips the whole handoff when the flag is off (no request)", () =>
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
