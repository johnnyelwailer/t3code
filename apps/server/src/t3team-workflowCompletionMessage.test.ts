import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationCommand } from "@t3tools/contracts";

import {
  buildWorkflowFailureText,
  deliverWorkflowCompletion,
  formatWorkflowOutput,
} from "./t3team-workflowCompletionMessage.ts";

describe("formatWorkflowOutput", () => {
  it("uses a human summary instead of exposing the structured result", () => {
    expect(
      formatWorkflowOutput({
        decision: "approved",
        markers: ["one", "two"],
        summary: "All checks passed.",
      }),
    ).toBe("All checks passed.");
  });

  it("humanizes simple structured output without raw JSON", () => {
    const output = formatWorkflowOutput({ decision: "approved", count: 3 });
    expect(output).toContain("**Decision:** approved");
    expect(output).toContain("**Count:** 3");
    expect(output).not.toContain("{");
  });

  // GHE (Defect 1, live repro): a workflow returning `{ findings: [...], summaryStats: {...} }`
  // rendered to the user as exactly "Workflow completed." — nested objects and arrays-of-objects
  // were filtered out before this text was ever stored, so no client-side fix could recover the
  // lost data. The rich rendering lives in the shared `renderWorkflowRecordAsDisplayText`; these
  // prove this, the pre-storage formatter, is wired to it.
  it("renders an array-of-objects field instead of collapsing to the generic fallback", () => {
    const output = formatWorkflowOutput({
      findings: [
        { title: "Rounding drift in total()", severity: "high", file: "src/cart.ts:4" },
        { title: "checkToken accepts whitespace", severity: "medium", file: "src/auth.ts:3" },
      ],
      summaryStats: { high: 1, medium: 1, low: 0 },
    });
    expect(output).toContain("Rounding drift in total()");
    expect(output).toContain("checkToken accepts whitespace");
    expect(output).toContain("High: 1, Medium: 1, Low: 0");
    expect(output).not.toBe("Workflow completed.");
  });

  it("renders a nested object field instead of collapsing to the generic fallback", () => {
    const output = formatWorkflowOutput({
      before: { status: "draft" },
      after: { status: "published" },
      artifactId: "art-1",
      artifactType: "document",
    });
    expect(output).toContain("**Artifact Id:** art-1");
    expect(output).toContain("**Artifact Type:** document");
    expect(output).toContain("Status: draft");
    expect(output).toContain("Status: published");
    expect(output).not.toBe("Workflow completed.");
  });
});

describe("buildWorkflowFailureText", () => {
  it("tells an agent that owns the source to fix and relaunch", () => {
    const text = buildWorkflowFailureText({ errorText: "boom", hostOwnsSource: true });
    expect(text).toContain("Fix the orchestration source");
    expect(text).toContain('t3team_help("agent-orchestration")');
  });

  it("tells a human on a bundled recipe what they can actually do", () => {
    const text = buildWorkflowFailureText({ errorText: "boom", hostOwnsSource: false });
    // A person who clicked a button cannot edit shipped recipe source, and t3team_help is not theirs.
    expect(text).not.toContain("Fix the orchestration source");
    expect(text).not.toContain("t3team_help");
    expect(text).toContain("nothing was saved");
    expect(text).toContain("start it again");
  });
});

describe("deliverWorkflowCompletion — the proposal card", () => {
  const dispatchCapture = () => {
    const dispatched: OrchestrationCommand[] = [];
    return {
      dispatched,
      dispatch: async (command: OrchestrationCommand) => {
        dispatched.push(command);
      },
    };
  };

  const deliver = async (output: unknown) => {
    const { dispatched, dispatch } = dispatchCapture();
    await deliverWorkflowCompletion({
      launchThreadId: "launch-1",
      workflowRunId: "run-1",
      output,
      projectId: "project-1",
      dispatch,
      newId: () => "id-1",
      nowIso: () => "2026-07-28T00:00:00.000Z",
    });
    const upsert = dispatched.find((command) => command.type === "thread.message.upsert");
    return upsert?.type === "thread.message.upsert" ? upsert.message : undefined;
  };

  it("carries a navigable ref for a run that proposed a draft, and keeps the text as the fallback", async () => {
    const message = await deliver({
      issueIdOrKey: "NXAI-6",
      proposed: true,
      field: "description",
      summary: "Proposed a rewritten description for NXAI-6 — review it on the work item.",
    });

    expect(message?.t3teamExt?.attachments).toEqual([
      {
        kind: "work-item-draft",
        projectId: "project-1",
        issueIdOrKey: "NXAI-6",
        field: "description",
        summary: "Proposed a rewritten description for NXAI-6 — review it on the work item.",
      },
    ]);
    // A client that renders no card still reads the same sentence it always did.
    expect(message?.text).toBe(
      "Proposed a rewritten description for NXAI-6 — review it on the work item.",
    );
  });

  it("carries no ref for a run that proposed nothing", async () => {
    const message = await deliver({ decision: "approved", summary: "All checks passed." });
    expect(message?.t3teamExt).toBeUndefined();
    expect(message?.text).toBe("All checks passed.");
  });
});
