import { UserSecretGrant, UserSecretGrantManifest } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import {
  checkGrantUse,
  hostMatches,
  needsPrompt,
  renderRequestHeader,
  strictestApproval,
} from "./t3team-userSecretGrants.ts";

const NOW = Date.parse("2026-10-26T10:00:00.000Z");

const grant = (overrides: Partial<UserSecretGrant> = {}): UserSecretGrant => ({
  name: "API_TOKEN",
  kind: "secret",
  deliveryModes: ["processInjection", "requestInjection"],
  destinations: ["api.example.com", "*.uploads.example.com"],
  approval: "oncePerSession",
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
      strictestApproval([grant({ approval: "automatic" }), grant({ approval: "standingGrant" })]),
    ).toBe("standingGrant");
    expect(
      strictestApproval([grant({ approval: "standingGrant" }), grant({ approval: "everyUse" })]),
    ).toBe("everyUse");
  });

  it("never prompts for automatic or standing grants", () => {
    expect(needsPrompt("automatic")).toBe(false);
    expect(needsPrompt("standingGrant")).toBe(false);
    expect(needsPrompt("oncePerSession")).toBe(true);
    expect(needsPrompt("everyUse")).toBe(true);
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
