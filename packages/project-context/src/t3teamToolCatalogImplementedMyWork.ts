import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * The My Work arrangement tools. The widget list below mirrors the bundled dashboard widgets
 * (`BUNDLED_DASHBOARD_WIDGETS`, packages/t3team-skill-packs); that package depends on this one, so
 * the text cannot import it — `t3team-toolBrokerMyWork.test.ts` pins the two together.
 */

const MY_WORK_DIGEST_READ_DESCRIPTION =
  "Read the viewer's My Work digest for one project (projectId) or all Jira-bound projects " +
  "(omit it) — the data you arrange with t3team.mywork.arrange. Read-only. Answer: { scope, " +
  "projects: [{ project, tickets, claims, decisions, changeRequests, transitions, sprint?, " +
  "blockers?, burndown?, dependencies? }], viewer, arrangement? }. tickets are the viewer's " +
  "Jira tickets (use their `id` in arrangement items, not the key). claims are threads (agents) " +
  "working a ticket. decisions are questions an agent parked waiting for the viewer. " +
  "changeRequests are pull requests: viewerAuthored ones are the viewer's own to move; ones " +
  "with viewerReviewRequested are other people's PRs awaiting the viewer's review — those are " +
  "the review requests, referenced by their `id` in a 'reviews' section's reviewIds. " +
  "dependencies say which tickets wait on or are waited on by the viewer's. transitions are " +
  "recent status changes. sprint is the active sprint. arrangement is the layout currently " +
  "stored for this scope (absent = the default layout).";

const MY_WORK_ARRANGE_DESCRIPTION =
  "Arrange the viewer's My Work digest: store the layout it shows (or reset it). Call " +
  "t3team.mywork.digest.read first; every ticketId and reviewId you place must be an id from " +
  "that read (unknown ids are dropped when shown). A plan is { sections: [{ id, kind, widget?, " +
  "placement, heading, hint?, items: [{ ticketId, why? }], reviewIds? }] } — kind 'items' " +
  "lists tickets in `items`, kind 'reviews' lists review-owed pull requests in `reviewIds` " +
  "(items empty). `why` is one short line shown beside a ticket. Bundled widgets (widget " +
  "defaults to the one for the kind): my-work.tickets lists tickets, placements side|main|footer " +
  "(side = compact list, main = grouped by story, footer = collapsed count); my-work.reviews " +
  "lists review-owed pull requests, placements side|main. An unknown widget or a placement a " +
  "widget does not allow is rejected with the reason — fix and call again. Section ids must be " +
  "unique, at most 12 sections. The latest arrangement per project (or for all projects) " +
  "replaces the previous one. Pass { reset: true } instead of a plan to return to the default " +
  "layout.";

export const IMPLEMENTED_T3TEAM_MY_WORK_TOOL_CATALOG = {
  "t3team.mywork.digest.read": {
    id: "t3team.mywork.digest.read",
    label: "Read My Work digest",
    title: "Read the viewer's My Work digest",
    description: MY_WORK_DIGEST_READ_DESCRIPTION,
    capabilities: ["read"],
    kind: "read",
    surfaces: ["my-work"],
    status: "implemented",
    defaultEnabled: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: {
          type: "string",
          description: "App project id. Omit to read the digest across all Jira-bound projects.",
        },
      },
    },
  },
  "t3team.mywork.arrange": {
    id: "t3team.mywork.arrange",
    label: "Arrange My Work digest",
    title: "Arrange or reset the viewer's My Work digest layout",
    description: MY_WORK_ARRANGE_DESCRIPTION,
    capabilities: ["write"],
    kind: "view-state",
    surfaces: ["my-work"],
    status: "implemented",
    defaultEnabled: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: {
          type: "string",
          description: "App project id. Omit to arrange the digest across all projects.",
        },
        plan: {
          type: "object",
          additionalProperties: false,
          description: "The arrangement. Give exactly one of plan or reset.",
          properties: {
            producer: { type: "string", enum: ["agent"] },
            producedAt: { type: "string", description: "ISO timestamp; defaults to now." },
            sections: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string", description: "Unique within the plan." },
                  kind: { type: "string", enum: ["items", "reviews"] },
                  widget: {
                    type: "string",
                    enum: ["my-work.tickets", "my-work.reviews"],
                    description: "Defaults to the widget for the kind.",
                  },
                  placement: { type: "string", enum: ["side", "main", "footer"] },
                  heading: { type: "string" },
                  hint: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        ticketId: { type: "string", description: "A tickets[].id of the digest." },
                        why: { type: "string", description: "One short line shown beside it." },
                      },
                      required: ["ticketId"],
                    },
                  },
                  reviewIds: {
                    type: "array",
                    items: { type: "string", description: "A review-owed changeRequests[].id." },
                  },
                },
                required: ["id", "kind", "placement", "heading", "items"],
              },
            },
          },
          required: ["sections"],
        },
        reset: {
          type: "boolean",
          description: "true: drop the stored arrangement and return to the default layout.",
        },
      },
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
