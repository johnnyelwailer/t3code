import type { AccountStatus } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { SignInMethods } from "./t3team-accountIssuer";
import { continuesToVerification, presentAccountSection } from "./t3team-accountPresentation";

const status = (auth: AccountStatus["auth"], lastError: string | null = null): AccountStatus => ({
  id: "nexplore",
  label: "Nexplore",
  auth,
  lastError,
});

const BOTH: SignInMethods = { browser: true, code: true };
const CODE_ONLY: SignInMethods = { browser: false, code: true };

const actions = (value: AccountStatus | null, methods = BOTH) =>
  presentAccountSection(value, methods).actions.map((entry) => entry.action);

describe("presentAccountSection", () => {
  it("leads with one-tap Microsoft sign-in and offers the code second, with the last failure", () => {
    const view = presentAccountSection(
      status({ _tag: "SignedOut" }, "The sign-in code expired. Start again."),
      BOTH,
    );
    expect(view.actions).toEqual([
      { action: "signIn", label: "Sign in with Microsoft", tone: "default" },
      { action: "signInWithCode", label: "Use a sign-in code instead", tone: "default" },
    ]);
    expect(view.detail).toBe("The sign-in code expired. Start again.");
  });

  it("offers no separate code row when the code is the only way in", () => {
    expect(actions(status({ _tag: "SignedOut" }), CODE_ONLY)).toEqual(["signIn"]);
  });

  it("shows the device code and where to enter it while signing in", () => {
    const view = presentAccountSection(
      status({
        _tag: "SigningIn",
        userCode: "ABCD-1234",
        verificationUri: "https://microsoft.com/devicelogin",
        expiresAtMs: 0,
      }),
      BOTH,
    );
    expect(view.title).toBe("Code ABCD-1234");
    expect(view.detail).toBe("Enter it at microsoft.com/devicelogin");
    expect(view.actions.map((entry) => entry.action)).toEqual(["openVerification", "cancel"]);
  });

  it("offers only cancel while a browser sign-in is open", () => {
    expect(
      actions(status({ _tag: "SigningIn", userCode: null, verificationUri: null, expiresAtMs: 0 })),
    ).toEqual(["cancel"]);
  });

  it("names the signed-in user and offers sign-out", () => {
    const view = presentAccountSection(status({ _tag: "SignedIn", name: "Ada Lovelace" }), BOTH);
    expect(view.title).toBe("Ada Lovelace");
    expect(view.actions.map((entry) => entry.action)).toEqual(["signOut"]);
  });

  it("offers nothing while the stored grant is read", () => {
    expect(actions(null)).toEqual([]);
  });
});

describe("continuesToVerification", () => {
  const signingIn = status({
    _tag: "SigningIn",
    userCode: "ABCD-1234",
    verificationUri: "https://microsoft.com/devicelogin",
    expiresAtMs: 0,
  });

  it("continues to Microsoft's page only for the default sign-in of a code-only build", () => {
    expect(continuesToVerification(signingIn, { method: "code", explicit: false })).toBe(true);
    expect(continuesToVerification(signingIn, { method: "code", explicit: true })).toBe(false);
    expect(continuesToVerification(signingIn, { method: "browser", explicit: false })).toBe(false);
    expect(
      continuesToVerification(status({ _tag: "SignedOut" }), { method: "code", explicit: false }),
    ).toBe(false);
  });
});
