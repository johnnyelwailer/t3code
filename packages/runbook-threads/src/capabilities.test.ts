import { describe, expect, it } from "vite-plus/test";

import { PermissionDeniedError } from "@runbook/core/errors";
import { assertNoLayerCapabilityEscalation, resolveChildCapabilities } from "./capabilities.ts";

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

  it("rejects a non-array `declared` instead of silently coercing to an empty grant", () => {
    expect(() =>
      resolveChildCapabilities({
        declared: "integration.read",
        parent,
        childLabel: "reviewer",
      }),
    ).toThrow(PermissionDeniedError);
    expect(() =>
      resolveChildCapabilities({
        declared: "integration.read",
        parent,
        childLabel: "reviewer",
      }),
    ).toThrow(/invalid `capabilities`/);
    expect(() =>
      resolveChildCapabilities({
        declared: null,
        parent,
        childLabel: "reviewer",
      }),
    ).toThrow(PermissionDeniedError);
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

describe("layer-escalation trust gate", () => {
  const base = new Set(["post-comment"]);

  it("no-ops for non-project layers", () => {
    expect(() =>
      assertNoLayerCapabilityEscalation({
        runbookName: "code-pr-review",
        layer: "defaults",
        baseCapabilities: base,
        declaredCapabilities: new Set(["post-comment", "run-agent-job"]),
      }),
    ).not.toThrow();
  });

  it("allows a project-layer runbook declaring a subset of its base capabilities", () => {
    expect(() =>
      assertNoLayerCapabilityEscalation({
        runbookName: "code-pr-review",
        layer: "project",
        baseCapabilities: base,
        declaredCapabilities: new Set(["post-comment"]),
      }),
    ).not.toThrow();
  });

  it("rejects a project-layer runbook declaring a capability its base did not have", () => {
    expect(() =>
      assertNoLayerCapabilityEscalation({
        runbookName: "code-pr-review",
        layer: "project",
        baseCapabilities: base,
        declaredCapabilities: new Set(["post-comment", "run-agent-job"]),
      }),
    ).toThrow(PermissionDeniedError);
  });
});
