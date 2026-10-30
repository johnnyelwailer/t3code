import { expect, it } from "vite-plus/test";

import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  fieldDraftSummary,
  fieldDraftValueText,
} from "~/t3team/workitem/t3team-workItemFieldDraftDisplay";
import { scalarDraftChangeLine } from "~/t3team/workitem/t3team-workItemDraftStripRowContent";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

const draft = (field: T3TeamScalarDraftMutation["field"], patch: Record<string, unknown>) =>
  ({ id: "d", field, patch }) as unknown as T3TeamScalarDraftMutation;

const MODEL = { priority: "Low" } as unknown as WorkItemFieldModel;

it.each([
  ["labels", { add: ["bug"], remove: ["wontfix"] }, "+bug, -wontfix", "+bug, -wontfix"],
  ["priority", { priority: "High" }, "High", "Priority: High"],
  ["fix_version", { add: ["2.4.0"], remove: [] }, "+2.4.0", "Fix version: +2.4.0"],
] as const)("shows a %s draft as a value and a card summary", (field, patch, value, summary) => {
  expect(fieldDraftValueText(draft(field, patch))).toBe(value);
  expect(fieldDraftSummary(draft(field, patch))).toBe(summary);
});

it("has nothing to show for an unreadable patch or another field", () => {
  expect(fieldDraftSummary(draft("labels", {}))).toBeUndefined();
  expect(fieldDraftSummary(draft("status", { targetStatus: "Done" }))).toBeUndefined();
});

it("shows the strip row's change: a priority change from the current value, name lists as additions", () => {
  expect(scalarDraftChangeLine(draft("priority", { priority: "High" }), MODEL)).toEqual({
    from: "Low",
    to: "High",
  });
  expect(scalarDraftChangeLine(draft("labels", { add: ["bug"], remove: [] }), MODEL)).toEqual({
    from: "",
    to: "+bug",
  });
});
