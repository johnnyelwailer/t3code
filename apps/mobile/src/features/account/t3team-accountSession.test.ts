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

      const started = yield* session.signIn;
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
      yield* session.signIn;

      const status = yield* published(session, "SignedOut");
      expect(status.lastError).toBe("The sign-in was declined.");
    }),
  );

  it.live("cancelling a pending sign-in stores nothing", () =>
    Effect.gen(function* () {
      const { issuer, secrets, session } = yield* setup();
      yield* session.signIn;
      yield* session.signOut;
      issuer.approveDevice();

      expect(session.snapshot().auth).toEqual({ _tag: "SignedOut" });
      expect(secrets.entries.size).toBe(0);
    }),
  );
});

describe("browser sign-in (app redirect registered)", () => {
  it.live("one tap signs in through the auth session without the code", () =>
    Effect.gen(function* () {
      const { issuer, session } = yield* setup({
        redirectUri: REDIRECT,
        openAuthSession: (mock) => (url) =>
          Effect.sync(() => ({ type: "success", url: mock.authorize(url) })),
      });
      yield* session.signIn;

      expect((yield* published(session, "SignedIn")).auth).toEqual({
        _tag: "SignedIn",
        name: "Ada Lovelace",
      });
      const grants = issuer.requests.filter((request) => request.path === "/token");
      expect(grants.map((request) => request.params.get("grant_type"))).toContain(
        "authorization_code",
      );
    }),
  );

  it.live("a dismissed browser leaves the device code working", () =>
    Effect.gen(function* () {
      const { issuer, session } = yield* setup({ redirectUri: REDIRECT });
      yield* session.signIn;
      expect(session.snapshot().auth._tag).toBe("SigningIn");
      expect(session.snapshot().lastError).toBeNull();

      issuer.approveDevice();
      expect((yield* published(session, "SignedIn")).auth).toEqual({
        _tag: "SignedIn",
        name: "Ada Lovelace",
      });
    }),
  );
});

describe("the stored grant", () => {
  it.live("survives a restart, refreshes expired tokens, and self-heals a revoked grant", () =>
    Effect.gen(function* () {
      const secrets = memorySecretStorage();
      const first = yield* setup({ secrets, expiresIn: 60 });
      first.issuer.approveDevice();
      yield* first.session.signIn;
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
