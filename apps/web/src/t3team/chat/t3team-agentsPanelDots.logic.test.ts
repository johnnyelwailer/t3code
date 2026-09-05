/**
 * Unit tests for the Agents-panel sub-run dot mapping
 * (t3team-agentsPanelDots.logic): a roster subagent's status (and what it's
 * doing) maps onto the shared GHE #201 dot vocabulary, with the panel's two
 * still result states (done/error) for outcomes the working row never renders.
 */
import { describe, expect, it } from "vite-plus/test";

import { panelDotIsLive, panelDotState } from "./t3team-agentsPanelDots.logic";

type Dot = { status: string; progress?: string | null; lastToolName?: string | null };

/**
 * The live mapping is delegated to the shared deriveDotState, so a running
 * agent reads thinking/writing/working by what it's doing — the panel must not
 * hard-code a different vocabulary from the working row.
 */
describe("panelDotState — sub-run status → dot vocabulary", () => {
  it("maps settled/terminal statuses onto still, readable results", () => {
    expect(panelDotState({ status: "completed" })).toBe("done");
    expect(panelDotState({ status: "failed" })).toBe("error");
    expect(panelDotState({ status: "idle" })).toBe("settled");
    expect(panelDotState({ status: "cancelled" })).toBe("settled");
    expect(panelDotState({ status: "interrupted" })).toBe("settled");
  });

  it("maps waiting onto the shared breathing state", () => {
    expect(panelDotState({ status: "waiting" })).toBe("waiting");
  });

  it("derives live pending/running states through the shared vocabulary", () => {
    // Analyze-ish work → thinking; edit/impl work → writing; plain work → working.
    expect(panelDotState({ status: "running", progress: "Analyzing the diff" })).toBe("thinking");
    expect(panelDotState({ status: "running", progress: "Editing the token provider" })).toBe(
      "writing",
    );
    expect(panelDotState({ status: "running" })).toBe("working");
    expect(panelDotState({ status: "pending" })).toBe("working");
  });

  it("covers every runtime status without falling through (no undefined)", () => {
    const all = [
      "pending",
      "running",
      "waiting",
      "idle",
      "completed",
      "failed",
      "cancelled",
      "interrupted",
    ] as const;
    for (const s of all) {
      const state = panelDotState({ status: s });
      expect(state).toBeDefined();
      const live = panelDotIsLive(state);
      expect(live).toBe(s === "pending" || s === "running" || s === "waiting");
    }
  });
});
