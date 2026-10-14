import type { AccountStatus } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { continuesToVerification, presentAccountSection } from "./t3team-accountPresentation";

const status = (auth: AccountStatus["auth"], lastError: string | null = null): AccountStatus => ({
  id: "nexplore",
  label: "Nexplore",
  auth,
  lastError,
});

const actions = (value: AccountStatus | null) =>
  presentAccountSection(value).actions.map((entry) => entry.action);

describe("presentAccountSection", () => {
  it("offers one-tap Microsoft sign-in when signed out, with the last failure", () => {
    const view = presentAccountSection(
      status({ _tag: "SignedOut" }, "The sign-in code expired. Start again."),
    );
    expect(view.actions).toEqual([
      { action: "signIn", label: "Sign in with Microsoft", tone: "default" },
    ]);
    expect(view.detail).toBe("The sign-in code expired. Start again.");
  });

  it("shows the device code and where to enter it while signing in", () => {
    const view = presentAccountSection(
      status({
        _tag: "SigningIn",
        userCode: "ABCD-1234",
        verificationUri: "https://microsoft.com/devicelogin",
        expiresAtMs: 0,
      }),
    );
    expect(view.title).toBe("Code ABCD-1234");
    expect(view.detail).toBe("Enter it at microsoft.com/devicelogin");
    expect(view.actions.map((entry) => entry.action)).toEqual(["openVerification", "cancel"]);
  });

  it("offers only cancel while a browser-only sign-in is open", () => {
    expect(
      actions(status({ _tag: "SigningIn", userCode: null, verificationUri: null, expiresAtMs: 0 })),
    ).toEqual(["cancel"]);
  });

  it("names the signed-in user and offers sign-out", () => {
    const view = presentAccountSection(status({ _tag: "SignedIn", name: "Ada Lovelace" }));
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

  it("continues to Microsoft's page only when no browser sign-in is opening", () => {
    expect(continuesToVerification(signingIn, false)).toBe(true);
    expect(continuesToVerification(signingIn, true)).toBe(false);
    expect(continuesToVerification(status({ _tag: "SignedOut" }), false)).toBe(false);
  });
});
