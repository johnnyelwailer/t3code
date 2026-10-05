import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyDelegationEffort,
  parseDelegationExtensions,
  resolveEnvironmentBinding,
  T3TEAM_DELEGATION_EXTENSIONS,
} from "./t3team-delegateTaskExtensions.ts";

const provider = (instanceId: string, slugs: ReadonlyArray<string>, capabilities: unknown) =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: slugs.map((slug) => ({ slug, name: slug, isCustom: false, capabilities })),
  }) as unknown as ServerProvider;

const ladder = provider("ladder", ["ladder-a"], {
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [
        { id: "low", label: "low" },
        { id: "medium", label: "medium", isDefault: true },
        { id: "high", label: "high" },
      ],
    },
  ],
});
const plain = provider("plain", ["plain-a"], null);
const tiered = provider("tiered", ["no-thinking", "low", "medium", "high"], null);
const providers = [ladder, plain, tiered];
const on = (instanceId: string, model: string) =>
  ({ instanceId, model, options: [] }) as unknown as ModelSelection;

describe("parseDelegationExtensions", () => {
  it("advertises exactly the keys it parses", () => {
    expect(T3TEAM_DELEGATION_EXTENSIONS.map((option) => option.key)).toEqual([
      "effort",
      "ticketId",
      "environment",
    ]);
  });

  it("parses effort, ticket and environment, trimming values", () => {
    const parsed = parseDelegationExtensions({
      effort: " high ",
      ticketId: " T-1 ",
      environment: { id: " env-2 ", label: " Lab " },
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        effort: "high",
        ticketId: "T-1",
        environment: { environmentId: "env-2", label: "Lab" },
      },
    });
    expect(parseDelegationExtensions(undefined)).toEqual({ ok: true, value: {} });
  });

  it("rejects provider vocabulary for effort and malformed values with agent-readable errors", () => {
    const effort = parseDelegationExtensions({ effort: "medium" });
    expect(effort.ok).toBe(false);
    if (!effort.ok) expect(effort.message).toContain("'light', 'standard' or 'high'");
    const ticket = parseDelegationExtensions({ ticketId: "  " });
    expect(ticket.ok).toBe(false);
    const environment = parseDelegationExtensions({ environment: "env-2" });
    expect(environment.ok).toBe(false);
    if (!environment.ok) expect(environment.message).toContain("extensions.environment");
  });
});

describe("applyDelegationEffort", () => {
  it("maps the tier onto the reasoning control without swapping the model", () => {
    const result = applyDelegationEffort({
      modelSelection: on("ladder", "ladder-a"),
      effort: "high",
      explicitTargetOptions: false,
      providers,
    });
    expect(result.modelSelection.model).toBe("ladder-a");
    expect(result.modelSelection.options).toEqual([{ id: "reasoningEffort", value: "high" }]);
    expect(result.note).toBeUndefined();
  });

  it("moves to the closest tier model when the tiers are the model slugs", () => {
    const result = applyDelegationEffort({
      modelSelection: on("tiered", "low"),
      effort: "high",
      explicitTargetOptions: false,
      providers,
    });
    expect(result.modelSelection.model).toBe("high");
    expect(result.note).toBeUndefined();
  });

  it("says when the effort cannot be honored", () => {
    const result = applyDelegationEffort({
      modelSelection: on("plain", "plain-a"),
      effort: "high",
      explicitTargetOptions: false,
      providers,
    });
    expect(result.modelSelection.model).toBe("plain-a");
    expect(result.note).toContain("not honored");
  });

  it("lets explicit target options win", () => {
    const selection = on("ladder", "ladder-a");
    const result = applyDelegationEffort({
      modelSelection: selection,
      effort: "light",
      explicitTargetOptions: true,
      providers,
    });
    expect(result.modelSelection).toBe(selection);
    expect(result.note).toContain("ignored");
  });
});

describe("resolveEnvironmentBinding", () => {
  it("treats this server's own environment as a no-op", () => {
    expect(resolveEnvironmentBinding({ environmentId: "env-1" as never }, "env-1")).toEqual({});
    expect(resolveEnvironmentBinding(undefined, "env-1")).toEqual({});
  });

  it("records another environment with its delivery boundary", () => {
    const resolved = resolveEnvironmentBinding(
      { environmentId: "env-2" as never, label: "Lab" },
      "env-1",
    );
    expect(resolved.binding).toEqual({ environmentId: "env-2", label: "Lab" });
    expect(resolved.note).toContain("'Lab'");
    expect(resolved.note).toContain("only reach threads in THIS environment");
  });
});
