# 41 — Work Item Detail Redesign

## Context

The work item detail view (`t3team-TicketDetail*`) is a read-only stack of generic cards:
a 4-cell metadata grid, parent summary, GitHub section, draft review, description, related
links, attachments, comments. Every value is display-only — the only Jira mutations in the
product live in the backlog table (assignee, estimate, status) and the kanban board.

Goals for this redesign:

1. Refined, polished, professional, delightful — a designed surface, not stacked cards.
2. Full feature parity with native Jira, **including mutations**.
3. Better UX than native Jira.
4. Fully responsive: usable from 320px phones to ultrawide.
5. Less slop — no labels or headings that restate what the content already says.
6. One reusable user-facing error surface; technical detail on demand only.

## Architectural decisions

### ADF-native, no markdown round trip

Jira Cloud stores rich text as ADF. The repo currently converts ADF→markdown for reading and
injects Jira's own `renderedFields` HTML. Neither can round-trip an edit.

Decision: **stay in ADF end to end.**

- **Read** — a real ADF→React renderer styled with our design system. Replaces the HTML
  injection path, and natively handles panels, status lozenges, mentions, media, tables and
  task lists that the markdown path flattens today.
- **Write** — a Lexical editor whose serializer emits ADF and whose deserializer consumes it.
  Lexical is already a dependency and already used deeply in `ComposerPromptEditor.tsx`, so
  this adds no dependency and matches repo idiom.
- **Lossless by construction** — ADF nodes we don't build editing UI for (panels, expands,
  embeds, media groups, extensions) become **immutable Lexical `DecoratorNode`s** that render
  through the ADF renderer and serialize back byte-identically. Nothing is ever destroyed, so
  there is no read-only fallback and no "edit in Jira" escape hatch.
- Markdown remains a paste/export convenience only, never the storage format.

Prior art to port (user's own code, `/Users/pj/Dev/ies/common-agentdirectives/tools/specops/packages/core/src`):
`adf-types.ts`, `adf-builders.ts`, `adf-nodes.ts`, `adf-marks.ts`, `adf-table.ts`,
`markdown-to-adf.ts` — small, tested, directly reusable as the ADF model layer.

### Container queries, not viewport media queries

The detail view lives inside a resizable pane, so viewport width lies about the space the
content actually has. Layout keys off `@container` (Tailwind v4, already used in
`t3team-ProjectDashboardKanbanDndUi.tsx`). Correct at any pane width, not just any window width.

Zones: header → title band → content column + field rail → agent aside (existing
`ResizableRightSidebarLayout`, preserved).

| Container width | Layout |
| --- | --- |
| < 40rem | Single column. Collapsed details summary above description. |
| 40–64rem | Single column, field rail becomes a 2-col grid card. |
| 64–90rem | Content + 280px rail. |
| 90–120rem | Content (max 760px) + 300px rail. |
| ≥ 120rem | Capped at 1600px centered; activity promoted beside description. |

### One write path

All simple field writes funnel through a single route backed by `jiraApi.updateIssue`.
Dedicated routes only where Jira's REST API demands them (transitions, assignee, comments,
attachments, links, watchers, votes, worklog).

`GET /issue/edit-meta` (Jira `editmeta`) drives both the allowed-values in pickers and
capability gating — controls the user cannot use are not rendered. Jira shows the field and
then fails on save; we don't.

### Errors

`t3team-ErrorState` (user-facing sentence + retry + `<details>` technical disclosure with
copy), `t3team-ErrorBoundary` (generic, wraps each section so one failure can't kill the
page), `t3team-errorMessage.ts` (maps 401/403/404/429/network/Jira field errors to plain
sentences). Replaces `T3TeamSidecarSectionErrorBoundary` and the ~12 raw `{error}` renders.

### Copy discipline

No heading where the content is self-evident. No `Assignee: Unassigned` — avatar plus
`Unassigned`. Empty states are one short line or nothing at all. Casualties include
`"Comments (newest first)"`, `"No description available."`, `"Loading ticket details..."`,
`"Unspecified"`, `"Unknown"`, and the uppercase micro-labels in `t3team-TicketMetadata.tsx`.

## Beyond-Jira UX

1. Container-query correctness (above).
2. Optimistic writes with inline rollback; skeletons after first load, never a page spinner.
3. Keyboard layer: `e` description, `c` comment, `s` status, `a` assign, `m` assign to me,
   `l` labels, `?` shortcut sheet.
4. Status transitions in one popover showing target statuses and transition names.
5. Merged activity stream — comments + changelog + worklog + **T3 agent threads and GitHub
   activity for this issue**, filterable. Jira structurally cannot do the last part.
6. Field provenance: who changed a field and when, on hover, sourced from the changelog.
7. Comment drafts persisted server-side (SQLite), restorable per issue.

## Slices

Each slice is a reviewable commit, verified live before the next begins.

### Slice A — shell, read parity, errors, copy
- `packages/integrations-atlassian`: ADF model (ported), ADF field extraction; extend
  `buildIssueFields` (duedate, timetracking, worklog, watches, votes, components,
  fixVersions, versions, resolution, resolutiondate, sprint, story points) and
  `normalize.ts` to surface them; `changelog` expand on `getIssue`.
- `apps/web/src/t3team/workitem/`: ADF renderer, layout shell, header + breadcrumb, title
  band, field rail (read-only), description, children, links, attachments, activity —
  new component family replacing `t3team-TicketDetail*` internals.
- `t3team-ErrorState` / `ErrorBoundary` / `errorMessage`; replace raw error renders.
- Copy pass.

### Slice B — field mutations
`update-fields` + `edit-meta` routes across all four layers; inline text, picker and date
primitives; `useWorkItemFieldMutation` (optimistic + rollback); status, assignee, priority,
labels, dates, sprint, estimate, parent, components, versions all editable.

### Slice C — content mutations
Lexical ADF editor (with opaque decorator nodes for unsupported types); comment
create/edit/delete; attachment upload (multipart, `X-Atlassian-Token: no-check`) and delete;
issue links create/delete + link types; child issue creation.

### Slice D — activity, engagement, polish
Changelog + worklog reads; merged filterable activity stream; watchers and votes; worklog
entry; keyboard layer + shortcut sheet; server-side comment drafts; view transitions.

## Constraints

- Additive guard: `apps/{web,server}` files need the `t3team-` prefix and a **200
  non-empty-line cap** (150 warns) — design modules under the cap, don't split later.
  `packages/integrations-atlassian/**` is prefix- and cap-exempt.
- New HTTP routes must be registered in **both** registries: `makeT3TeamRoutesLayer` and the
  route-merge list in `server.ts`. Verify against the running server before claiming done.
- Never target upstream `pingdotgg/t3code` with a PR.

## Verification

Per slice:
- Focused vitest for changed modules (`vp test run <files>`), serially — never the full suite.
- Storybook stories for reusable UI; snapshot coverage for the detail screen.
- Live click-through via the `test-t3-app` skill: one isolated environment, real pairing URL
  auth, exercise the changed flow in the controlled browser. No shims, no minted tokens.
- Mutations verified against a real Jira issue, then re-read to confirm persistence.
- `node t3team-additive-guard.mjs` green before reporting completion.
- Cross-provider review (Codex + copilot-peer) on Slices B and C before finalizing.
