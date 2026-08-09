import { describe, expect, it } from "vite-plus/test";

import { PermissionDeniedError } from "@runbook/core/errors";
import { resolveChildCapabilities } from "./capabilities.ts";

const parent = new Set(["user", "integration.read"]);

describe("host-neutral child capabilities", () => {
  it("inherits exactly the parent's grant", () => {
    expect(
      resolveChildCapabilities({ declared: "inherit", parent, childLabel: "reviewer" }),
    ).toEqual(["user", "integration.read"]);
  });

  it("accepts string and tool-group entries in an explicit subset", () => {
    expect(
      resolveChildCapabilities({
        declared: [
          "integration.read",
          { kind: "tool-group", id: "user", label: "User interaction" },
        ],
        parent,
        childLabel: "reviewer",
      }),
    ).toEqual(["integration.read", "user"]);
  });

  it("rejects a capability outside the parent's grant at spawn time", () => {
    expect(() =>
      resolveChildCapabilities({
        declared: ["integration.read", "integration.write"],
        parent,
        childLabel: "reviewer",
      }),
    ).toThrow(PermissionDeniedError);
  });
});
