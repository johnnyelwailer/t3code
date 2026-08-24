import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";

import {
  buildStartChildModelSelection,
  readStartChildArgs,
} from "./t3team-toolBrokerStartChildArgs.ts";

describe("buildStartChildModelSelection", () => {
  it("normalizes codex model aliases from start_child tool args", () => {
    const selection = buildStartChildModelSelection(
      {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
        options: [{ id: "reasoningEffort", value: "low" }],
      },
      {
        model: "gpt-5",
        reasoningEffort: "medium",
      },
      {
        driver: ProviderDriverKind.make("codex"),
        models: [
          {
            slug: "gpt-5.4",
            name: "GPT",
            isCustom: false,
            capabilities: {
              optionDescriptors: [
                {
                  id: "reasoningEffort",
                  label: "Reasoning",
                  type: "select",
                  options: [
                    { id: "low", label: "Low" },
                    { id: "medium", label: "Medium" },
                  ],
                },
              ],
            },
          },
        ],
      },
    );

    expect(selection).toEqual({
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      options: [{ id: "reasoningEffort", value: "medium" }],
    });
  });
});

describe("readStartChildArgs", () => {
  it("accepts an own-worktree child request with a linked repo and base ref", () => {
    expect(
      readStartChildArgs({
        name: "Review repo child",
        isolation: "own-worktree",
        repo_full_name: "pingdotgg/t3code",
        repo_ref: "release/7.0",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Review repo child",
        isolation: "own-worktree",
        usedLegacyExecutionScope: false,
        repoFullName: "pingdotgg/t3code",
        repoRef: "release/7.0",
      },
    });
  });

  it("accepts an own-worktree request without repo_full_name (local-workspace context)", () => {
    expect(
      readStartChildArgs({
        name: "Local fix child",
        isolation: "own-worktree",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Local fix child",
        isolation: "own-worktree",
        usedLegacyExecutionScope: false,
      },
    });
  });

  it("accepts a shared child request without repository fields", () => {
    expect(
      readStartChildArgs({
        name: "Planning child",
        isolation: "shared",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Planning child",
        isolation: "shared",
        usedLegacyExecutionScope: false,
      },
    });
  });

  it("rejects shared isolation with repository fields", () => {
    expect(
      readStartChildArgs({
        name: "Planning child",
        isolation: "shared",
        repo_full_name: "pingdotgg/t3code",
      }),
    ).toEqual({
      ok: false,
      message:
        "t3team.thread.start_child with isolation='shared' must not include 'repo_full_name' or 'repo_ref'; use isolation='own-worktree' to give the child a dedicated worktree.",
    });
  });

  it("rejects shared isolation with only repo_ref", () => {
    expect(
      readStartChildArgs({
        name: "Planning child",
        isolation: "shared",
        repo_ref: "main",
      }),
    ).toEqual({
      ok: false,
      message:
        "t3team.thread.start_child with isolation='shared' must not include 'repo_full_name' or 'repo_ref'; use isolation='own-worktree' to give the child a dedicated worktree.",
    });
  });

  it("requires an explicit isolation decision", () => {
    expect(
      readStartChildArgs({
        name: "Ambiguous child",
      }),
    ).toEqual({
      ok: false,
      message:
        "t3team.thread.start_child requires 'isolation' set to 'shared' or 'own-worktree' (or the deprecated 'execution_scope'). 'shared' keeps the child in the shared checkout; 'own-worktree' gives it a dedicated branch + worktree.",
    });
  });

  it("rejects an invalid isolation value", () => {
    expect(
      readStartChildArgs({
        name: "Typo child",
        isolation: "worktre",
      }),
    ).toEqual({
      ok: false,
      message:
        "t3team.thread.start_child 'isolation' must be exactly 'shared' or 'own-worktree'. Use 'shared' when the child can work in the project's shared checkout (planning, triage, synthesis, read-only review), and 'own-worktree' when it should get its own branch and dedicated worktree (implementation, debugging, tests, PR work).",
    });
  });

  it("maps the deprecated execution_scope alias onto isolation", () => {
    expect(
      readStartChildArgs({
        name: "Legacy planning child",
        execution_scope: "metarepo",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Legacy planning child",
        isolation: "shared",
        usedLegacyExecutionScope: true,
      },
    });
    expect(
      readStartChildArgs({
        name: "Legacy repo child",
        execution_scope: "repository",
        repo_full_name: "pingdotgg/t3code",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Legacy repo child",
        isolation: "own-worktree",
        usedLegacyExecutionScope: true,
        repoFullName: "pingdotgg/t3code",
      },
    });
  });

  it("rejects an invalid legacy execution_scope value", () => {
    expect(
      readStartChildArgs({
        name: "Typo child",
        execution_scope: "metrepo",
      }),
    ).toEqual({
      ok: false,
      message:
        "t3team.thread.start_child 'execution_scope' (deprecated) must be exactly 'metarepo' or 'repository'. Prefer 'isolation' with 'shared' or 'own-worktree'.",
    });
  });

  it("rejects passing both isolation and the deprecated execution_scope", () => {
    expect(
      readStartChildArgs({
        name: "Double child",
        isolation: "shared",
        execution_scope: "metarepo",
      }),
    ).toEqual({
      ok: false,
      message:
        "t3team.thread.start_child accepts either 'isolation' or the deprecated 'execution_scope', not both. Use 'isolation' with 'shared' or 'own-worktree'.",
    });
  });
});
