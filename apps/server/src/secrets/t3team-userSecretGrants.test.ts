import { UserSecretGrant, UserSecretGrantManifest } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  checkGrantUse,
  hostMatches,
  grantPolicyKey,
  needsPrompt,
  renderRequestHeader,
  strictestApproval,
} from "./t3team-userSecretGrants.ts";

const decodeGrantSync = Schema.decodeUnknownSync(UserSecretGrant);

const NOW = Date.parse("2026-10-26T10:00:00.000Z");

const grant = (overrides: Partial<UserSecretGrant> = {}): UserSecretGrant => ({
  name: "API_TOKEN",
  kind: "secret",
  deliveryModes: ["processInjection", "requestInjection"],
  destinations: ["api.example.com", "*.uploads.example.com"],
  approval: "perThread",
  ...overrides,
});

describe("destination matching", () => {
  it("matches exact hosts case- and port-insensitively", () => {
    expect(hostMatches("api.example.com", "API.example.com:443")).toBe(true);
    expect(hostMatches("api.example.com", "api.example.com.")).toBe(true);
    expect(hostMatches("api.example.com", "evil-api.example.com")).toBe(false);
    expect(hostMatches("api.example.com", "api.example.com.evil.net")).toBe(false);
  });

  it("matches a wildcard only for subdomains, never the bare domain or a lookalike", () => {
    expect(hostMatches("*.uploads.example.com", "eu.uploads.example.com")).toBe(true);
    expect(hostMatches("*.uploads.example.com", "a.b.uploads.example.com")).toBe(true);
    expect(hostMatches("*.uploads.example.com", "uploads.example.com")).toBe(false);
    expect(hostMatches("*.uploads.example.com", "evil-uploads.example.com")).toBe(false);
    expect(hostMatches("*.uploads.example.com", "user@eu.uploads.example.com")).toBe(false);
  });

  it("rejects a wildcard over a bare top-level domain in the contract", () => {
    const decode = Schema.decodeUnknownOption(UserSecretGrant);
    expect(decode(grant({ destinations: ["*.com"] }))._tag).toBe("None");
    expect(decode(grant({ destinations: ["*.example.com"] }))._tag).toBe("Some");
  });
});

describe("grant checks", () => {
  it("refuses a name that was not granted", () => {
    expect(checkGrantUse("OTHER", undefined, "processInjection", undefined, NOW)).toBe(
      "not_granted",
    );
  });

  it("refuses a login slot even when it is listed", () => {
    expect(
      checkGrantUse(
        "CLAUDE_LOGIN",
        grant({ kind: "authSlot" }),
        "processInjection",
        "api.example.com",
        NOW,
      ),
    ).toBe("login_slot");
  });

  it("refuses a name in the login-slot namespace even when listed as a secret", () => {
    const mislabelled = grant({ name: "AUTH_SLOT_CLAUDE", kind: "secret", approval: "never" });
    const modes: UserSecretGrant["deliveryModes"] = ["processInjection", "requestInjection"];
    for (const mode of modes) {
      expect(checkGrantUse("AUTH_SLOT_CLAUDE", mislabelled, mode, "api.example.com", NOW)).toBe(
        "login_slot",
      );
    }
    expect(checkGrantUse("AUTH_SLOT_CLAUDE", undefined, "processInjection", undefined, NOW)).toBe(
      "login_slot",
    );
  });

  it("refuses a mode the entry does not allow", () => {
    expect(
      checkGrantUse(
        "API_TOKEN",
        grant({ deliveryModes: ["requestInjection"] }),
        "processInjection",
        "api.example.com",
        NOW,
      ),
    ).toBe("mode_not_allowed");
  });

  it("requires a listed destination when the entry has destinations", () => {
    expect(checkGrantUse("API_TOKEN", grant(), "processInjection", undefined, NOW)).toBe(
      "destination_required",
    );
    expect(checkGrantUse("API_TOKEN", grant(), "processInjection", "attacker.net", NOW)).toBe(
      "destination_not_allowed",
    );
    expect(
      checkGrantUse("API_TOKEN", grant(), "processInjection", "api.example.com", NOW),
    ).toBeUndefined();
  });

  it("refuses an expired grant and accepts one still valid", () => {
    expect(
      checkGrantUse(
        "API_TOKEN",
        grant({ expiresAt: "2026-10-26T09:59:59.000Z" }),
        "processInjection",
        "api.example.com",
        NOW,
      ),
    ).toBe("expired");
    expect(
      checkGrantUse(
        "API_TOKEN",
        grant({ expiresAt: "2026-10-27T00:00:00.000Z" }),
        "processInjection",
        "api.example.com",
        NOW,
      ),
    ).toBeUndefined();
  });

  it("requires destinations for request injection and rejects duplicate names", () => {
    const decodeGrant = Schema.decodeUnknownOption(UserSecretGrant);
    expect(decodeGrant(grant({ destinations: [] }))._tag).toBe("None");
    const decodeManifest = Schema.decodeUnknownOption(UserSecretGrantManifest);
    expect(decodeManifest({ version: 1, grants: [grant(), grant()] })._tag).toBe("None");
  });
});

describe("approval", () => {
  it("takes the strictest policy across the entries one use names", () => {
    expect(
      strictestApproval([grant({ approval: "never" }), grant({ approval: "standingGrant" })]),
    ).toBe("standingGrant");
    expect(
      strictestApproval([grant({ approval: "standingGrant" }), grant({ approval: "everyUse" })]),
    ).toBe("everyUse");
  });

  it("prompts only for perMachine, perThread and everyUse", () => {
    expect(needsPrompt("never")).toBe(false);
    expect(needsPrompt("standingGrant")).toBe(false);
    expect(needsPrompt("perMachine")).toBe(true);
    expect(needsPrompt("perThread")).toBe(true);
    expect(needsPrompt("everyUse")).toBe(true);
  });

  it("orders perMachine below perThread, so one use's prompt takes the narrower scope", () => {
    expect(
      strictestApproval([grant({ approval: "perMachine" }), grant({ approval: "perThread" })]),
    ).toBe("perThread");
  });

  it("defaults an entry without an approval to perThread", () => {
    const { approval: _omitted, ...withoutApproval } = grant();
    const decoded = decodeGrantSync(withoutApproval);
    expect(decoded.approval).toBe("perThread");
  });

  it("keys a policy by everything that bounds it, not just the name", () => {
    expect(grantPolicyKey(grant())).toBe(grantPolicyKey(grant()));
    const changes: ReadonlyArray<Partial<UserSecretGrant>> = [
      { destinations: ["api.example.com"] },
      { approval: "perMachine" },
      { deliveryModes: ["processInjection"] },
      { expiresAt: "2026-12-31T00:00:00.000Z" },
    ];
    for (const change of changes) {
      expect(grantPolicyKey(grant(change))).not.toBe(grantPolicyKey(grant()));
    }
  });
});

describe("request header", () => {
  it("renders the default bearer header and a custom template literally", () => {
    expect(renderRequestHeader(grant(), "dummy-$&-value")).toEqual({
      name: "Authorization",
      value: "Bearer dummy-$&-value",
    });
    expect(
      renderRequestHeader(
        grant({ requestHeader: { name: "X-Api-Key", template: "{value}" } }),
        "dummy",
      ),
    ).toEqual({ name: "X-Api-Key", value: "dummy" });
  });
});
