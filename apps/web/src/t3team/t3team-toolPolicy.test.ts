import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_T3TEAM_THREAD_TOOL_IDS } from "@t3tools/project-context/t3teamToolCatalog";

import { resolveT3TeamThreadToolIds } from "~/t3team/t3team-toolPolicy";

// Purely backlog/my-work/work-item surfaced tools (real catalog ids, chosen to exercise
// each restricted surface, including a tool spanning two restricted surfaces). Note: no
// `github`-surfaced tool is `"implemented"` yet, so none is part of the `T3TeamToolId` type
// to exercise here — the `github` surface is still handled identically to `project`/`thread`
// in the implementation (only surfaces in `WORK_SOURCE_ONLY_SURFACES` gate a tool).
const BACKLOG_ONLY_TOOL_ID = "t3team.backlog.set_assignee_filter";
const WORK_ITEM_AND_MY_WORK_TOOL_ID = "t3team.work_item.assignee.draft_update";
// Tools that also carry a non-restricted surface, so they must stay available everywhere.
const THREAD_ONLY_TOOL_ID = "t3team.widget.show";
const PROJECT_AND_THREAD_TOOL_ID = "t3team.project.refresh_context_bundle";
// Work-item surfaced but ALSO thread-surfaced: the only work-source tool that reaches the
// default thread set, so it is what this gate actually has to remove.
const WORK_ITEM_AND_THREAD_TOOL_ID = "t3team.work_item.refresh_context_bundle";

const ALL_CANDIDATE_IDS = [
  BACKLOG_ONLY_TOOL_ID,
  WORK_ITEM_AND_MY_WORK_TOOL_ID,
  THREAD_ONLY_TOOL_ID,
  PROJECT_AND_THREAD_TOOL_ID,
] as const;

describe("resolveT3TeamThreadToolIds", () => {
  it("drops backlog/my-work/work-item-only tools for a local workspace project", () => {
    const allowed = resolveT3TeamThreadToolIds({
      projectSource: { provider: "local" },
      candidateToolIds: ALL_CANDIDATE_IDS,
    });

    expect(allowed).toEqual([THREAD_ONLY_TOOL_ID, PROJECT_AND_THREAD_TOOL_ID]);
  });

  it("keeps thread/project tools for a local workspace project", () => {
    const allowed = resolveT3TeamThreadToolIds({
      projectSource: { provider: "local" },
      candidateToolIds: [THREAD_ONLY_TOOL_ID, PROJECT_AND_THREAD_TOOL_ID],
    });

    expect(allowed).toEqual([THREAD_ONLY_TOOL_ID, PROJECT_AND_THREAD_TOOL_ID]);
  });

  it("keeps every candidate tool for an atlassian (work) project", () => {
    const allowed = resolveT3TeamThreadToolIds({
      projectSource: { provider: "atlassian" },
      candidateToolIds: ALL_CANDIDATE_IDS,
    });

    expect(allowed).toEqual(ALL_CANDIDATE_IDS);
  });

  it("drops a work-item tool that is also thread-surfaced", () => {
    // The case that makes this gate worth having. `surfaces` doubles as the selector for the
    // default thread set, so the one work-source tool in that set is tagged
    // ["work-item", "thread"]. A rule requiring EVERY surface to be work-source-only would
    // keep it and filter nothing at all from a local workspace's default tools.
    const allowed = resolveT3TeamThreadToolIds({
      projectSource: { provider: "local" },
      candidateToolIds: [WORK_ITEM_AND_THREAD_TOOL_ID, THREAD_ONLY_TOOL_ID],
    });

    expect(allowed).toEqual([THREAD_ONLY_TOOL_ID]);
  });

  it("filters the real default thread tool set down for a local workspace", () => {
    const allowed = resolveT3TeamThreadToolIds({
      projectSource: { provider: "local" },
      candidateToolIds: DEFAULT_T3TEAM_THREAD_TOOL_IDS,
    });

    expect(allowed).not.toContain(WORK_ITEM_AND_THREAD_TOOL_ID);
    expect(allowed).toContain(THREAD_ONLY_TOOL_ID);
    expect(allowed.length).toBe(DEFAULT_T3TEAM_THREAD_TOOL_IDS.length - 1);
  });

  it("leaves the real default thread tool set intact for a work project", () => {
    expect(
      resolveT3TeamThreadToolIds({
        projectSource: { provider: "atlassian" },
        candidateToolIds: DEFAULT_T3TEAM_THREAD_TOOL_IDS,
      }),
    ).toEqual(DEFAULT_T3TEAM_THREAD_TOOL_IDS);
  });

  it("is a pure function of its input", () => {
    const input = {
      projectSource: { provider: "local" as const },
      candidateToolIds: ALL_CANDIDATE_IDS,
    };

    expect(resolveT3TeamThreadToolIds(input)).toEqual(resolveT3TeamThreadToolIds(input));
    expect(resolveT3TeamThreadToolIds({ ...input })).toEqual(
      resolveT3TeamThreadToolIds({ ...input }),
    );
  });
});
