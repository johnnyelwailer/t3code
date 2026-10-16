import { describe, expect, it } from "@effect/vitest";
import type { AccountStatus } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import type { OpenAuthSession } from "./t3team-accountBrowserSignIn";
import { type AccountSession, makeAccountSession } from "./t3team-accountSession";
import {
  MOCK_USER_CODE,
  MOCK_VERIFICATION_URI,
  type MockAccountIssuer,
  makeMockAccountIssuer,
  memorySecretStorage,
  webCrypto,
} from "./t3team-mockAccountIssuer.fixtures";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const REDIRECT = "nexiwork://auth";
const dismissed: OpenAuthSession = () => Effect.succeed({ type: "closed" });

const setup = (
  options: Parameters<typeof makeMockAccountIssuer>[0] & {
    readonly openAuthSession?: (issuer: MockAccountIssuer) => OpenAuthSession;
    readonly secrets?: ReturnType<typeof memorySecretStorage>;
  } = {},
) =>
  Effect.gen(function* () {
    const issuer = makeMockAccountIssuer(options);
    const secrets = options.secrets ?? memorySecretStorage();
    const session = yield* makeAccountSession(issuer.account, {
      http: issuer.httpClient,
      secrets,
      crypto: webCrypto,
      openAuthSession: options.openAuthSession?.(issuer) ?? dismissed,
    });
    return { issuer, secrets, session };
  });

/** Resolves once the published state reaches `tag` — what the UI would render next. */
const published = (session: AccountSession, tag: AccountStatus["auth"]["_tag"]) =>
  Effect.promise(
    () =>
      new Promise<AccountStatus>((resolve) => {
        const check = () => {
          if (session.snapshot().auth._tag === tag) resolve(session.snapshot());
        };
        session.subscribe(check);
        check();
      }),
  );

describe("device-code sign-in (no app redirect registered)", () => {
  it.live("goes SignedOut → SigningIn{code} → SignedIn{name} and serves broker tokens", () =>
    Effect.gen(function* () {
      const { issuer, session } = yield* setup();
      expect(session.snapshot().auth).toEqual({ _tag: "SignedOut" });

      const started = yield* session.signIn("code");
      expect(started.auth).toMatchObject({
        _tag: "SigningIn",
        userCode: MOCK_USER_CODE,
        verificationUri: MOCK_VERIFICATION_URI,
      });
      issuer.approveDevice(1);

      const signedIn = yield* published(session, "SignedIn");
      expect(signedIn).toEqual({
        id: "nexplore",
        label: "Nexplore",
        auth: { _tag: "SignedIn", name: "Ada Lovelace" },
        lastError: null,
      });
      const token = yield* session.accessToken("broker");
      expect(token.split(".")).toHaveLength(3);
      expect(issuer.requests.filter((request) => request.path === "/token")).toHaveLength(2);
    }),
  );

  it.live("returns to SignedOut with the reason when the user declines", () =>
    Effect.gen(function* () {
      const { issuer, session } = yield* setup();
      issuer.declineDevice();
      yield* session.signIn("code");

      const status = yield* published(session, "SignedOut");
      expect(status.lastError).toBe("The sign-in was declined.");
    }),
  );

  it.live("cancelling a pending sign-in stores nothing", () =>
    Effect.gen(function* () {
      const { issuer, secrets, session } = yield* setup();
      yield* session.signIn("code");
      yield* session.signOut;
      issuer.approveDevice();

      expect(session.snapshot().auth).toEqual({ _tag: "SignedOut" });
      expect(secrets.entries.size).toBe(0);
    }),
  );
});

const approving =
  (mock: MockAccountIssuer): OpenAuthSession =>
  (url) =>
    Effect.sync(() => ({ type: "success", url: mock.authorize(url) }));

const redirectingWith =
  (params: Record<string, string>): OpenAuthSession =>
  (url) =>
    Effect.sync(() => {
      const callback = new URL(REDIRECT);
      callback.searchParams.set("state", new URL(url).searchParams.get("state") ?? "");
      for (const [key, value] of Object.entries(params)) callback.searchParams.set(key, value);
      return { type: "success", url: callback.toString() };
    });

describe("browser sign-in (app redirect registered)", () => {
  it.live("one tap signs in through the auth session without requesting a code", () =>
    Effect.gen(function* () {
      const { issuer, session } = yield* setup({
        redirectUri: REDIRECT,
        openAuthSession: approving,
      });
      expect(session.methods).toEqual({ browser: true, code: true });
      yield* session.signIn("browser");

      expect((yield* published(session, "SignedIn")).auth).toEqual({
        _tag: "SignedIn",
        name: "Ada Lovelace",
      });
      expect(issuer.requests.map((request) => request.path)).not.toContain("/devicecode");
      const grants = issuer.requests.filter((request) => request.path === "/token");
      expect(grants.map((request) => request.params.get("grant_type"))).toEqual([
        "authorization_code",
      ]);
    }),
  );

  it.live("a dismissed browser ends the attempt with a clear message and no code", () =>
    Effect.gen(function* () {
      const { issuer, session } = yield* setup({ redirectUri: REDIRECT });
      yield* session.signIn("browser");

      const status = yield* published(session, "SignedOut");
      expect(status.lastError).toContain("did not finish");
      expect(status.lastError).toContain(REDIRECT);
      expect(issuer.requests.map((request) => request.path)).not.toContain("/devicecode");
    }),
  );

  it.live("an issuer error on the redirect is summarised, not dumped", () =>
    Effect.gen(function* () {
      const { session } = yield* setup({
        redirectUri: REDIRECT,
        openAuthSession: () =>
          redirectingWith({
            error: "invalid_request",
            error_description: [
              "AADSTS50011: The redirect URI does not match.",
              "Trace ID: 1234",
              "Correlation ID: abcd",
            ].join("\n"),
          }),
      });
      yield* session.signIn("browser");

      expect((yield* published(session, "SignedOut")).lastError).toBe(
        "Microsoft declined the sign-in: AADSTS50011: The redirect URI does not match.",
      );
    }),
  );

  it.live("the sign-in code stays available as an explicit alternative", () =>
    Effect.gen(function* () {
      const opened = vi.fn();
      const { issuer, session } = yield* setup({
        redirectUri: REDIRECT,
        openAuthSession: () => () => Effect.sync(opened).pipe(Effect.as({ type: "closed" })),
      });
      const started = yield* session.signIn("code");
      expect(started.auth).toMatchObject({ _tag: "SigningIn", userCode: MOCK_USER_CODE });

      issuer.approveDevice();
      yield* published(session, "SignedIn");
      expect(opened).not.toHaveBeenCalled();
    }),
  );
});

describe("a build without the browser redirect", () => {
  it.live("offers only the code and refuses the browser sign-in", () =>
    Effect.gen(function* () {
      const { session } = yield* setup();
      expect(session.methods).toEqual({ browser: false, code: true });
      const error = yield* Effect.flip(session.signIn("browser"));
      expect(error.message).toContain("sign-in code");
    }),
  );
});

describe("the stored grant", () => {
  it.live("survives a restart, refreshes expired tokens, and self-heals a revoked grant", () =>
    Effect.gen(function* () {
      const secrets = memorySecretStorage();
      const first = yield* setup({ secrets, expiresIn: 60 });
      first.issuer.approveDevice();
      yield* first.session.signIn("code");
      yield* published(first.session, "SignedIn");

      const restarted = yield* makeAccountSession(first.issuer.account, {
        http: first.issuer.httpClient,
        secrets,
        crypto: webCrypto,
        openAuthSession: dismissed,
      });
      expect(restarted.snapshot().auth).toEqual({ _tag: "SignedIn", name: "Ada Lovelace" });
      yield* restarted.accessToken("broker");
      expect(secrets.entries.get("t3team.account.nexplore.refresh-token")).toBe("refresh-2");

      first.issuer.revokeAll();
      const error = yield* Effect.flip(restarted.accessToken("broker"));
      expect(error).toMatchObject({ reason: "sign_in_required" });
      expect(restarted.snapshot().auth).toEqual({ _tag: "SignedOut" });
    }),
  );
});
