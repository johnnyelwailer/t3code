import { BrokerConnectionTarget, RelayConnectionTarget } from "@t3tools/client-runtime/connection";
import { type AccountStatus, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { becameSignedIn, brokerEnvironmentIds, needsBrokerSignIn } from "./t3team-brokerSignIn";

const desktop = EnvironmentId.make("env-desktop");
const vm = EnvironmentId.make("env-vm");

const account = (auth: AccountStatus["auth"]): AccountStatus => ({
  id: "nexplore",
  label: "Microsoft",
  auth,
  lastError: null,
});
const signedOut = account({ _tag: "SignedOut" });
const signedIn = account({ _tag: "SignedIn", name: "Ada" });
const signingIn = account({
  _tag: "SigningIn",
  userCode: "ABCD",
  verificationUri: null,
  expiresAtMs: 0,
});

describe("the Microsoft sign-in for broker environments", () => {
  const catalog = {
    entries: new Map([
      [
        desktop,
        { target: new RelayConnectionTarget({ environmentId: desktop, label: "Desktop" }) },
      ],
      [
        vm,
        { target: new BrokerConnectionTarget({ environmentId: vm, label: "VM", sessionId: "41" }) },
      ],
    ]),
  };

  it("finds the environments reached through the broker", () => {
    expect(brokerEnvironmentIds(catalog)).toEqual([vm]);
  });

  it("is offered while a broker environment exists and the account is not signed in", () => {
    expect(needsBrokerSignIn([vm], signedOut)).toBe(true);
    expect(needsBrokerSignIn([vm], signingIn)).toBe(true);
    expect(needsBrokerSignIn([vm], signedIn)).toBe(false);
    expect(needsBrokerSignIn([], signedOut)).toBe(false);
    expect(needsBrokerSignIn([vm], null)).toBe(false);
  });

  it("reconnects only on the change to signed in, not on the first read", () => {
    expect(becameSignedIn(signingIn, signedIn)).toBe(true);
    expect(becameSignedIn(signedOut, signedIn)).toBe(true);
    expect(becameSignedIn(null, signedIn)).toBe(false);
    expect(becameSignedIn(signedIn, signedIn)).toBe(false);
    expect(becameSignedIn(signedIn, signedOut)).toBe(false);
  });
});
