import type { T3TeamPrExplainer } from "@t3tools/contracts";

import { add, ctx, del } from "./t3team-prExplainerLine.fixtures";

/** An API/data-shape pull request: a schema diff, then the new call order. */
export const apiExplainer: T3TeamPrExplainer = {
  version: 1,
  pullRequest: { number: 419, title: "Ticket estimate API returns its unit" },
  headSha: "c1e1d2e4d0",
  generatedAt: "2026-10-07T07:05:00.000Z",
  summary: "Estimates now carry their unit. The client stops guessing hours vs points.",
  risk: "medium",
  reviewMinutes: 15,
  steps: [
    {
      id: "a1",
      kind: "change",
      caption: "The estimate payload gets a unit. One field is renamed.",
      visual: {
        kind: "shape",
        name: "TicketEstimate",
        fields: [
          { name: "ticketId", type: "TicketId", change: "unchanged" },
          { name: "value", type: "number", change: "renamed", was: "points" },
          { name: "unit", type: '"hours" | "points"', change: "added" },
          { name: "source", type: "EstimateSource", change: "retyped", was: "string" },
          { name: "legacyField", type: "string", change: "removed" },
        ],
      },
      diffs: [
        {
          id: "a1-schema",
          path: "packages/contracts/src/ticketEstimate.ts",
          status: "modified",
          additions: 3,
          deletions: 2,
          hunk: { oldStart: 8, oldLines: 6, newStart: 8, newLines: 7 },
          before: [
            ctx(8, 8, "export const TicketEstimate = Schema.Struct({"),
            ctx(9, 9, "  ticketId: TicketId,"),
          ],
          lines: [
            del(10, "  points: Schema.Number,", { mark: ["points"] }),
            add(10, "  value: Schema.Number,", { mark: ["value"] }),
            add(11, '  unit: Schema.Literals(["hours", "points"]),', { mark: ["unit"] }),
            del(12, "  legacyField: Schema.String,"),
          ],
          after: [ctx(13, 13, "});")],
        },
      ],
    },
    {
      id: "a2",
      kind: "change",
      caption: "The server reads the unit from Jira before it answers.",
      visual: {
        kind: "sequence",
        actors: [
          { id: "client", label: "Client" },
          { id: "server", label: "Server" },
          { id: "jira", label: "Jira" },
        ],
        messages: [
          {
            id: "q1",
            from: "client",
            to: "server",
            label: "getEstimate",
            style: "call",
            change: "unchanged",
          },
          {
            id: "q2",
            from: "server",
            to: "jira",
            label: "fieldConfig",
            style: "call",
            change: "added",
          },
          { id: "q3", from: "jira", to: "server", label: "unit", style: "return", change: "added" },
          {
            id: "q4",
            from: "client",
            to: "client",
            label: "guessUnit()",
            style: "call",
            change: "removed",
          },
          {
            id: "q5",
            from: "server",
            to: "client",
            label: "{ value, unit }",
            style: "return",
            change: "unchanged",
          },
        ],
      },
      diffs: [
        {
          id: "a2-server",
          path: "apps/server/src/tickets/estimates.ts",
          status: "modified",
          additions: 2,
          hunk: { oldStart: 31, oldLines: 2, newStart: 31, newLines: 4 },
          lines: [
            add(31, "  const config = yield* jira.fieldConfig(project);", {
              mark: ["jira.fieldConfig"],
            }),
            add(32, "  const unit = estimateUnitOf(config);", {
              mark: ["estimateUnitOf"],
              info: "one extra Jira call, cached 10 min",
            }),
            ctx(31, 33, "  return { value, unit };"),
          ],
        },
      ],
    },
    {
      id: "a3",
      kind: "check",
      caption: "Check: old mobile clients still read the removed field.",
      visual: { kind: "none" },
      diffs: [
        {
          id: "a3-mobile",
          path: "apps/mobile/src/tickets/EstimateBadge.tsx",
          status: "modified",
          hunk: { oldStart: 22, oldLines: 1, newStart: 22, newLines: 1 },
          lines: [
            ctx(22, 22, '  const label = estimate.legacyField ?? "";', { warn: "field removed" }),
          ],
        },
      ],
    },
  ],
};
