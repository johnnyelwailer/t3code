import type { T3TeamExplainer } from "../model/t3team-explainer";

import { add, ctx, del } from "./t3team-explainerLine.fixtures";

/** An API/data-shape pull request: a schema diff, then the new call order. */
export const apiExplainer: T3TeamExplainer = {
  version: 2,
  subject: { kind: "pr", number: 419, title: "Ticket estimate API returns its unit" },
  headSha: "c1e1d2e4d0",
  generatedAt: "2026-10-07T07:05:00.000Z",
  summary: "Estimates now carry their unit. The client stops guessing hours vs points.",
  risk: "medium",
  reviewMinutes: 15,
  steps: [
    {
      id: "a1",
      kind: "change",
      label: "Payload",
      caption: "The estimate payload gets a unit. One field is renamed.",
      blocks: [
        {
          id: "a1-shape",
          type: "shape",
          name: "TicketEstimate",
          fields: [
            { name: "ticketId", type: "TicketId", change: "unchanged" },
            { name: "value", type: "number", change: "renamed", was: "points" },
            { name: "unit", type: '"hours" | "points"', change: "added" },
            { name: "source", type: "EstimateSource", change: "retyped", was: "string" },
            { name: "legacyField", type: "string", change: "removed" },
          ],
        },
        {
          id: "a1-schema",
          type: "diff",
          path: "packages/contracts/src/ticketEstimate.ts",
          status: "modified",
          newStart: 8,
          before: [
            ctx("export const TicketEstimate = Schema.Struct({"),
            ctx("  ticketId: TicketId,"),
          ],
          lines: [
            del("  points: Schema.Number,", { mark: ["points"] }),
            add("  value: Schema.Number,", { mark: ["value"] }),
            add('  unit: Schema.Literals(["hours", "points"]),', { mark: ["unit"] }),
            del("  legacyField: Schema.String,"),
          ],
          after: [ctx("});")],
        },
      ],
    },
    {
      id: "a2",
      kind: "change",
      label: "Server",
      caption: "The server reads the unit from Jira before it answers.",
      blocks: [
        {
          id: "a2-seq",
          type: "sequence",
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
            {
              id: "q3",
              from: "jira",
              to: "server",
              label: "unit",
              style: "return",
              change: "added",
            },
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
        {
          id: "a2-server",
          type: "diff",
          path: "apps/server/src/tickets/estimates.ts",
          status: "modified",
          newStart: 31,
          lines: [
            add("  const config = yield* jira.fieldConfig(project);", {
              mark: ["jira.fieldConfig"],
            }),
            add("  const unit = estimateUnitOf(config);", {
              mark: ["estimateUnitOf"],
              info: "one extra Jira call, cached 10 min",
            }),
            ctx("  return { value, unit };"),
          ],
        },
      ],
    },
    {
      id: "a3",
      kind: "check",
      label: "Old clients",
      caption: "Check: old mobile clients still read the removed field.",
      blocks: [
        {
          id: "a3-warn",
          type: "callout",
          tone: "warn",
          text: "Mobile 1.4 and older read legacyField. They show an empty estimate until updated.",
        },
        {
          id: "a3-mobile",
          type: "diff",
          path: "apps/mobile/src/tickets/EstimateBadge.tsx",
          status: "modified",
          newStart: 22,
          lines: [ctx('  const label = estimate.legacyField ?? "";', { warn: "field removed" })],
        },
      ],
    },
  ],
};
