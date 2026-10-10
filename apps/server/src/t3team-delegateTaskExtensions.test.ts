import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyDelegationEffort,
  parseDelegationExtensions,
  parseSkillsExtension,
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
      "skills",
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

describe("parseSkillsExtension", () => {
  it("accepts 1-5 well-formed names, in order", () => {
    expect(parseSkillsExtension(["deploy-staging", "a"])).toEqual({
      ok: true,
      value: ["deploy-staging", "a"],
    });
    expect(parseSkillsExtension(Array(5).fill("s")).ok).toBe(true);
    expect(parseSkillsExtension(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseDelegationExtensions({ skills: ["deploy-staging"] })).toEqual({
      ok: true,
      value: { skills: ["deploy-staging"] },
    });
  });

  it("rejects malformed values, naming what a valid skill name looks like", () => {
    const notArray = parseSkillsExtension("deploy-staging");
    expect(notArray.ok).toBe(false);
    if (!notArray.ok) {
      expect(notArray.message).toContain("extensions.skills must be a non-empty array");
      expect(notArray.message).toContain("lowercase letters, digits and dashes");
    }
    expect(parseSkillsExtension([]).ok).toBe(false);
    const tooMany = parseSkillsExtension(Array(6).fill("s"));
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.message).toContain("at most 5");
    // NOTE: a bare "-" passes the spec'd charset ^[a-z0-9-]{1,64}$ (format gate only —
    // the driver's registry is what makes such a name unresolvable).
    for (const bad of ["Deploy", "deploy_staging", "dep loy", "s".repeat(65), 7, null]) {
      const rejected = parseSkillsExtension([bad]);
      expect(rejected.ok, JSON.stringify(bad)).toBe(false);
      if (!rejected.ok) expect(rejected.message).toContain("invalid skill name");
    }
    const viaGate = parseDelegationExtensions({ skills: ["Nope!"] });
    expect(viaGate.ok).toBe(false);
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
