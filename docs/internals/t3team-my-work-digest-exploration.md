# My Work Digest: UX exploration (WIP)

Owner-requested WIP snapshot for GHE pj/nexi-distribution#480 "Work coordination: get above the 100-chat problem". Storybook-first exploration on branch `explore/mywork-digest-story`. Nothing here is wired into the app yet.

Story group: `T3Team/Project Dashboard/My Work Digest` (8 stories). Files: `apps/web/src/t3team/t3team-projectMyWorkDigestPlan.ts`, `t3team-ProjectMyWorkDigest{Header,Toolbar,Rows,View}.tsx`, `t3team-ProjectMyWorkViewSwitch.tsx`, `t3team-projectMyWorkDigestFixtures.tsx`, `stories/t3team-ProjectDashboardMyWorkDigest.stories.tsx`.

## Owner direction, in order given

1. My Work gets view modes with a toggle, same pattern as Backlog table/planning-space. Default is a new digest view: deterministic linked graph (work items, claims, change requests, decisions) plus a workflow-backed AI digest, one click away from the view.
2. UI exploration is always Storybook first, real components, realistic sample data, live URL.
3. The AI is not a separate card. It shapes every part of the view: order, structure, grouping, headings. Data-driven, but the deterministic layer only refreshes the view or supplies fallback heuristics.
4. One click sets up the workflow. It refreshes automatically afterwards. No second click, only pause.
5. Future: user or agent can rearrange the layout and generate custom widgets anywhere, a fully customized digest.
6. On the first cut: needs widescreen, use the full space. Reduce noise, no explanatory descriptions, super compact, let content speak. Content visual-first, short texts, nicely formatted. Once running, pause goes behind a dropdown menu. "Content is nothing like what I would imagine." Reference given: the standalone PW Sprint 8.5 digest page (described below).
7. Needs a variant for all projects vs one selected project.
8. "arranging · 2 h" status label read strangely. Now "auto · updated 2 h ago".

## Model

- **Three lenses** in the toggle: Digest (default), Hierarchy (today's list/table + groupMode), Board (today's kanban). Attention from the design doc §6 is the Digest's fallback ordering rule, not a lens. Scope, filters, density are parameters of every lens.
- **DigestPlan**: ordered sections, each `{ id, kind: "items", placement: side | main | footer, heading, hint?, items: [{ ticketId, why? }] }`. The plan holds refs only. Facts (decision question, claim agent and age, PR state, status transition) are rendered from the live graph.
- **Two producers, same schema.** Heuristic: needs-you and review to the side lane, claimed or moved items to the main lane as a numbered recommended order grouped by parent story, stalled and parked to collapsed footer summaries. Agent: same schema, free to invent headings, merge, reorder, demote, annotate. It cannot add refs outside the graph.
- **Deterministic refresh**: on every graph change refs are re-resolved. Closed items drop out, empty sections vanish, unseen items land in trailing `New · <bucket>` sections placed by the heuristic. Toolbar shows `N new`.
- **One click** "Arrange for me" starts a durable recipe-backed workflow on `project.dashboard.myWork`. Then the toolbar shows a status pill (`auto · updated 2 h ago` or `paused · …`) and an ellipsis menu with Pause/Resume auto-arrange and Open workflow thread. Error: badge plus Retry, heuristic arrangement stays.
- **Scope**: `graph.scope = "project" | "all"`. All-projects drops the sprint header, shows per-project counts in the header meta, project chips on rows and group headers. Same plan schema.
- **Persistence**: `lens` and the last plan per user and scope in localStorage next to My Work state. No route-search mirror for My Work (that mirror is the documented N-instance race that forced the all-projects fork).
- **Future widgets**: `kind` on sections is the extension point. A custom widget is another section kind with its own renderer, produced and stored the same way.

## Layout (current cut)

```
kicker  Digest · IES NG                                 03.09.–23.09. · 9 days left · Philip · PO
h1      PW Sprint 8.5 · Day 12 of 20
        ━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  55 % elapsed
        – goal 1   – goal 2   – goal 3
toolbar [✦][⋮≡][▥]                                  ● auto · updated 2 h ago  [2 new]  [⋯]

side lane (2fr)                  | main lane (5fr)
NEEDS YOU 2                      | PRIORITY 6
┌ key  title            status ┐ | ┌ IES-13068 EdO Transport: Detailbereich      3 items ┐
│      [decision chip · 3 h]   │ | │ 01 key  title   [agent dots] [PR chip]   status │
REVIEW FIRST 2                   | │ 02 …                                                │
┌ …                            ┐ | └ ────────────────────────────────────────────────────┘
                                 | ┌ IES-18234 Leistungsadmin …                  2 items ┐
─────────────────────────────────────────────────────────────────────────────────────────
footer: COLD AGENT THREADS 2 [ 2  silent > 3 d · nudge or release   Show ]   PARKED 2 [ … ]
```

**Layout notes (2026-09-14 cut):**

- **Priority** (was "Recommended order"): short, punchy heading. Renamed in plan.ts + fixtures.
- **Agent dots** sit on the right side of the title row, next to the status dot — not in the middle of the row.
- **Story group headers** have alignment spacers (`w-7` + `size-3.5`) so the ticket key lines up with the task-row key below it.
- **Standalone tasks** (no story parent) render in a plain `T3SurfacePanel` with `divide-y`, no story-group wrapper.
- **Rows are clickable**: `cursor-pointer` + `onClick` opens `ticket.ref.url` in a new tab. Inner `<a>` links (key, title, PR chip) use `stopPropagation`.
- **Responsive shell**: no `max-w` cap. Fluid padding `px-4 sm:px-6 xl:px-10 2xl:px-14`. Works at 360 px and 2560 px+.
- **PR chips**: 7-state lifecycle (draft / open / needs-you / changes-requested / ci-failing / approved / merged). Reviewer identity via avatar + tooltip only (no name text).
- **Action line**: one per item, priority order: blocker → decision → changes-requested → needs-you → ci-failing → unhandled comments → null.

## Reused components

| Component                                     | Source                                               | Used for                                 |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `WorkItemPersonAvatar`                        | `workitem/t3team-WorkItemPersonAvatar.tsx`           | Reviewer avatar in PR chips              |
| `PullRequestReviewOutcomeBadge`               | `components/pullRequest/pullRequestPresentation.tsx` | PR state chip styling                    |
| `Badge`                                       | `components/ui/badge.tsx`                            | Status dots, project chips               |
| `Collapsible`                                 | `components/ui/collapsible.tsx`                      | Footer summary sections                  |
| `Empty`                                       | `components/ui/empty.tsx`                            | Empty state for lanes                    |
| `ToggleGroup`                                 | `components/ui/toggle-group.tsx`                     | View switch (Digest / Hierarchy / Board) |
| `JiraIssueTypeIcon`                           | `workitem/t3team-JiraIssueTypeIcon.tsx`              | Issue-type icon in rows                  |
| `T3SurfacePanel`                              | `components/ui/surface-panel.tsx`                    | Lane containers, standalone task panels  |
| `buildProjectTicketHierarchy`                 | `project/t3team-projectTicketHierarchy.ts`           | Parent/child grouping in main lane       |
| `createProjectBacklogTestTicket`              | `project/t3team-projectBacklogTestTicket.ts`         | Fixture ticket factory                   |
| `Tooltip` / `TooltipTrigger` / `TooltipPopup` | `components/ui/tooltip.tsx`                          | Reviewer avatar tooltip                  |
| `animate-status-pulse`                        | CSS token in `globals.css`                           | Agent dot pulse animation                |
| `ActiveAgentEntry`                            | `chat/t3team-activeAgentsCore.ts`                    | Agent dot type                           |

## Reference page: PW Sprint 8.5 · Digest (http://127.0.0.1:18765/)

Standalone HTML digest the owner pointed to as "a potential example". What it contains, top to bottom:

- **Header**: kicker `Digest · IES NG`, h1 `PW Sprint 8.5 · Tag 12 von 20`, meta row `03.09. – 23.09.2026 CEST · Heute Mo 14.09. · 9 Tage verbleibend · Stand: 2026-09-14 11:24 CEST`.
- **Timeline**: `55 % des Sprints vergangen … Ende Di 23.09.`, a 4px track with fill and a "today" dot, tick labels 03.09. / 13.09. / 14.09. heute / 18.09. / 23.09.
- **Two-column body**, left narrow, right wide.
  - Left: `SPRINTZIEL` (four dash bullets). `BRAUCHT DICH 1` (amber card: `pr` tag, mono repo#number, issue key, one-line why, chip `hive/ies-spital#64 Wartet · product threads`, link `In Jira öffnen →`). `WARTET AUF DEIN REVIEW 1` (one-line hint, then a card per issue: key header with PR count, rows `repo#n | title | PR →`, sub-line reviewer state, `green:4`). `REVIEW ZUWEISEN 11` (story-grouped cards, `Reviewer wählen`, `Ohne Ticket · niedrige Prio` group).
  - Right: `WARTET AUF REVIEW 8` collapsed to one summary row `8 PRs mit Reviewer — kein Zuweisen nötig · Anzeigen`. `EMPFOHLENE REIHENFOLGE 12`: story groups (grey header: key, title, `3 Tasks`, chips `Philip · Story`, `Angie · BE`, `Katharina · Review`, PR chips coloured by state: approved green, waiting amber, draft grey), then numbered rows `01 IES-23718 FE: Meldung anpassen … ● In Progress` with status dot right-aligned. Items without a story group continue the numbering flat with `EPIC IES-15935 …` sub-lines and `Philip · Task` chips.
- **Footer row**: `HANDLED / AGENTS` summary `14 Pipeline / Handled — kein Braucht-dich · Details anzeigen` (expands to repo#n rows with `PR öffnen →` and a pipeline status line). `MEETING NOTIZEN 16` summary `16 Punkte aus Meetings — zur Kenntnis, kein Handlungsbedarf · Anzeigen`.
- **Sources line**: `Quellen: Jira openSprints · Sprintziel aus Jira PW Sprint 8.5 · Meeting-Notizen aus Knowledge-Summaries (nur zur Kenntnis) · Agent-PRs aus pr-watch · Stand · live`.
- **Visual system**: 14px system UI, mono for keys and repo#n, small-caps kickers with count, zinc greys, one accent, semantic soft chips (approved / waiting / needs / merged / draft), 4px timeline, max-width 1760px, light and dark via `prefers-color-scheme`. Data loaded client-side from `/view`.

What the current Storybook cut takes from it: kicker+count headings, two-lane layout with narrow needs-you side, numbered recommended order grouped by story, chips instead of sentences, collapsed footer summaries, sprint header with progress track, full width. Not yet taken: sprint goal in the side lane, per-person assignment chips, review-assignment lane, meeting notes, sources line.

## Decided (parent thread, 2026-09-14)

- **Plan return path:** a typed receipt on the workflow run carrying `plan + producedAt`. Not the workflow-card channel, which stays progress/status. The surface rehydrates the last receipt on reload.
- **Default lens:** Digest for everyone, no opt-in migration. A stored lens preference still wins on revisit.

## Open for the owner

1. One auto-arrange workflow per project, or one across all projects.
2. Which reference lanes belong in Nexi Work's digest: review assignment, meeting notes, handled/agents.
