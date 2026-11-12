import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { makeCredentialSources, type CredentialSourcesDeps } from "./t3team-CredentialSources.ts";

const CANARY = "ghp_canaryTokenValue0123456789abcdef";

type RestCall = { readonly host: string; readonly path: string };

const deps = (options: {
  readonly scopes?: string | undefined;
  readonly environment?: Record<string, string>;
  readonly signedIn?: boolean;
}) => {
  const calls: RestCall[] = [];
  const value: CredentialSourcesDeps = {
    environment: options.environment ?? {},
    rest: (input) => {
      calls.push({ host: input.host, path: input.path });
      return options.signedIn === false
        ? Effect.fail({ message: "not signed in" })
        : Effect.succeed({
            status: 200,
            headers: { "x-oauth-scopes": options.scopes },
            body: JSON.stringify({ login: "pj" }),
          });
    },
    credential: (host) =>
      options.signedIn === false
        ? Effect.fail({ message: `no credential for ${host}` })
        : Effect.succeed(Redacted.make(CANARY)),
  };
  return { value, calls };
};

const probe = (
  d: ReturnType<typeof deps>,
  input: Parameters<ReturnType<typeof makeCredentialSources>["probe"]>[0],
) => makeCredentialSources(d.value).probe(input);

it.effect("a signed-in gh with the scope is offered with its account and no refresh hint", () =>
  Effect.gen(function* () {
    const d = deps({ scopes: "repo, read:org, read:packages" });
    const result = yield* probe(d, { host: "github.com", scopes: ["read:packages"] });
    const gh = result.sources.find((source) => source.kind === "gh");
    assert.deepStrictEqual(gh, {
      kind: "gh",
      host: "github.com",
      account: "pj",
      scopeCheck: "ok",
      missingScopes: [],
    });
    assert.deepStrictEqual(d.calls, [{ host: "github.com", path: "/user" }]);
  }),
);

it.effect("a missing scope shows the one-line refresh command, never a token", () =>
  Effect.gen(function* () {
    const d = deps({ scopes: "repo, read:org" });
    const result = yield* probe(d, { host: "nexplore.ghe.com", scopes: ["read:packages", "repo"] });
    const gh = result.sources.find((source) => source.kind === "gh");
    assert.strictEqual(gh?.kind === "gh" ? gh.scopeCheck : undefined, "missing");
    assert.deepStrictEqual(gh?.kind === "gh" ? gh.missingScopes : undefined, ["read:packages"]);
    assert.strictEqual(
      gh?.kind === "gh" ? gh.refreshCommand : undefined,
      "gh auth refresh -h nexplore.ghe.com -s read:packages",
    );
    assert.notInclude(JSON.stringify(result), CANARY);
  }),
);

it.effect("a token that reports no scopes is unknown, not missing", () =>
  Effect.gen(function* () {
    const d = deps({ scopes: undefined });
    const result = yield* probe(d, { host: "github.com", scopes: ["read:packages"] });
    const gh = result.sources.find((source) => source.kind === "gh");
    assert.strictEqual(gh?.kind === "gh" ? gh.scopeCheck : undefined, "unknown");
    assert.strictEqual(gh?.kind === "gh" ? gh.refreshCommand : undefined, undefined);
  }),
);

it.effect("no gh source without a sign-in; manual is always offered", () =>
  Effect.gen(function* () {
    const result = yield* probe(deps({ signedIn: false }), { host: "github.com" });
    assert.deepStrictEqual(result.sources, [{ kind: "manual" }]);
  }),
);

it.effect("the env source checks only the named variable and never lists the environment", () =>
  Effect.gen(function* () {
    const d = deps({ environment: { NX_GH_PKG_READ_TOKEN: CANARY, OTHER_SECRET: "other" } });
    const result = yield* probe(d, { name: "NX_GH_PKG_READ_TOKEN", host: "github.com" });
    assert.deepStrictEqual(
      result.sources.filter((source) => source.kind === "env"),
      [{ kind: "env", name: "NX_GH_PKG_READ_TOKEN" }],
    );
    assert.notInclude(JSON.stringify(result), "OTHER_SECRET");
    assert.notInclude(JSON.stringify(result), CANARY);
    const absent = yield* probe(deps({}), { name: "NX_GH_PKG_READ_TOKEN" });
    assert.deepStrictEqual(absent.sources, [{ kind: "manual" }]);
  }),
);

it.effect("an env value shaped like another kind of secret is flagged without showing it", () =>
  Effect.gen(function* () {
    const d = deps({ environment: { NX_GH_PKG_READ_TOKEN: "AKIAIOSFODNN7EXAMPLE" } });
    const result = yield* probe(d, { name: "NX_GH_PKG_READ_TOKEN", host: "npm.pkg.github.com" });
    assert.deepStrictEqual(
      result.sources.filter((source) => source.kind === "env"),
      [{ kind: "env", name: "NX_GH_PKG_READ_TOKEN", warning: "different_secret_type" }],
    );
    assert.notInclude(JSON.stringify(result), "AKIA");
  }),
);

it.effect("read returns the gh token or the named variable, and refuses what is not there", () =>
  Effect.gen(function* () {
    const d = deps({ environment: { NX_GH_PKG_READ_TOKEN: "from-env" } });
    const sources = makeCredentialSources(d.value);
    assert.strictEqual((yield* sources.read({ source: "gh", host: "github.com" })).value, CANARY);
    assert.strictEqual(
      (yield* sources.read({ source: "env", name: "NX_GH_PKG_READ_TOKEN" })).value,
      "from-env",
    );
    const missing = yield* sources.read({ source: "env", name: "NOT_SET" }).pipe(Effect.flip);
    assert.strictEqual(missing.reason, "not_available");
    const invalid = yield* sources.read({ source: "gh" }).pipe(Effect.flip);
    assert.strictEqual(invalid.reason, "invalid_request");
    const signedOut = yield* makeCredentialSources(deps({ signedIn: false }).value)
      .read({ source: "gh", host: "github.com" })
      .pipe(Effect.flip);
    assert.strictEqual(signedOut.reason, "not_available");
  }),
);

it.effect("a registry host is answered by its forge's sign-in, and any other host is refused", () =>
  Effect.gen(function* () {
    const d = deps({ scopes: "repo, read:packages" });
    const mapped = yield* probe(d, { host: "npm.pkg.github.com", scopes: ["read:packages"] });
    const gh = mapped.sources.find((source) => source.kind === "gh");
    assert.strictEqual(gh?.kind === "gh" ? gh.host : undefined, "github.com");
    assert.deepStrictEqual(d.calls, [{ host: "github.com", path: "/user" }]);

    const elsewhere = deps({ scopes: "repo" });
    const refused = yield* probe(elsewhere, { host: "evil.example" });
    assert.deepStrictEqual(refused.sources, [{ kind: "manual" }]);
    assert.deepStrictEqual(
      elsewhere.calls,
      [],
      "no request is made to a host the server does not know",
    );
    const read = yield* makeCredentialSources(elsewhere.value)
      .read({ source: "gh", host: "evil.example" })
      .pipe(Effect.flip);
    assert.strictEqual(read.reason, "not_available");

    const configured = deps({ scopes: "repo", environment: { GH_HOST: "git.corp.example" } });
    const own = yield* probe(configured, { host: "git.corp.example" });
    assert.strictEqual(
      own.sources.some((source) => source.kind === "gh"),
      true,
    );
  }),
);

it.effect(
  "scopes compare case-insensitively, repo covers what it implies, requests are de-duplicated",
  () =>
    Effect.gen(function* () {
      const d = deps({ scopes: "REPO, Read:Org" });
      const result = yield* probe(d, {
        host: "github.com",
        scopes: [
          "public_repo",
          "repo:status",
          "read:org",
          "READ:ORG",
          "read:packages",
          "read:packages",
        ],
      });
      const gh = result.sources.find((source) => source.kind === "gh");
      assert.deepStrictEqual(gh?.kind === "gh" ? gh.missingScopes : undefined, ["read:packages"]);
      assert.strictEqual(
        gh?.kind === "gh" ? gh.refreshCommand : undefined,
        "gh auth refresh -h github.com -s read:packages",
      );
    }),
);

it.effect("write:packages counts as read:packages, repo alone does not", () =>
  Effect.gen(function* () {
    const writer = yield* probe(deps({ scopes: "repo, write:packages" }), {
      host: "github.com",
      scopes: ["read:packages"],
    });
    const wgh = writer.sources.find((source) => source.kind === "gh");
    assert.deepStrictEqual(wgh?.kind === "gh" ? wgh.missingScopes : undefined, []);
    const repoOnly = yield* probe(deps({ scopes: "repo" }), {
      host: "github.com",
      scopes: ["read:packages"],
    });
    const rgh = repoOnly.sources.find((source) => source.kind === "gh");
    assert.deepStrictEqual(rgh?.kind === "gh" ? rgh.missingScopes : undefined, ["read:packages"]);
  }),
);
