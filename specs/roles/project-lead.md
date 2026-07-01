# Delivery Profile: Project Lead (PL / Projektleiter)

> Specified in [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
>
> **Implementation status:** 🟡 Partial. The `project-lead` profile now ships in
> [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts) (it replaced the
> generic `delivery-coordinator`). Its dedicated `project-lead` pack and several specified
> recipes are still gaps — see [§3](#3-what-serves-this-profile-today) and [§4](#4-gaps).

For project leads coordinating scope, schedule, risk, and dependencies: concise status,
blockers, milestone/release checklists, standup-ready summaries.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `project-lead` |
| `title` | Project Lead |
| `tags` | `delivery`, `coordination`, `planning` |
| `communicationStyle.technicalDepth` | `low` |
| `communicationStyle.brevity` | `short` |
| `communicationStyle.guidanceStyle` | `guided` |
| `surfaceDefaults.detailDensity` | `guided` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `status-report`, `risk-register`, `dependency-map`, `milestone-plan`, `standup-summary` |
| `defaultActionFamilies` | `summarize`, `plan`, `coordinate` |

## 2. Skill pack & recipes (specified)

**Project Lead Pack** — default profile: Project Lead.

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Summarize project risk | ✅ Implemented | `summarize-project-risk` ("Summarize project risk") |
| Create status report | ✅ Implemented | `draft-status-update` ("Draft status update") |
| Identify blocked work | 🟡 Partial | `unblock-my-work`, `unblock-blocked-ticket`, `focus-needs-my-action` |
| Map dependencies | ⬜ Specified only | — (dependency framing inside `summarize-project-risk`) |
| Draft standup update | 🟡 Partial | `draft-status-update` (done / in progress / blocked / next) |
| Create milestone / release checklist | ✅ Implemented | `release-handoff-checklist` ("Prepare release handoff") |

## 3. What serves this profile today

> **Note:** The `project-lead` profile now ships in `profiles.ts`; the mapping below reflects
> the generic `delivery-coordinator` profile it was derived from and the recipes usable today.

- **Profile basis (pre-rename):** `delivery-coordinator` — low depth, short, guided;
  artifacts `status-update`, `blocker-list`, `checklist`, `timeline`; recommends packs
  `delivery`, `release`. Top recipe weights: `draft-status-update` 30,
  `release-handoff-checklist` 25, `summarize-project-risk` 20.
- **Implemented packs that overlap:** `delivery`, `release`.
- **Implemented recipes usable now (dashboard-oriented):**
  - ✅ `summarize-project-risk` — blockers, unclear work, dependency risks, next actions.
  - ✅ `draft-status-update` — concise team status update.
  - ✅ `prioritize-pending-work` — rank now / next / later.
  - ✅ `focus-needs-my-action` — narrow to work waiting on the user.
  - ✅ `next-best-task` — highest-leverage next task.
  - ✅ `shape-next-backlog-slice` — pick next 1–3 backlog items.
  - ✅ `unblock-my-work` / `unblock-blocked-ticket` — find/clear the top blocker.
  - ✅ `re-scope-ticket-overrun` — split / defer / finish an overrun ticket.
  - ✅ `release-handoff-checklist`, `prepare-post-merge-closeout` — coordination/closeout.

## 4. Gaps

- ✅ Profile `project-lead` is now defined in `profiles.ts` (it replaced `delivery-coordinator`).
- ⬜ Pack id `project-lead` not defined; closest is `delivery`.
- ⬜ Dedicated `map-dependencies` recipe and a true `risk-register` (RAID) /
  `dependency-map` / `milestone-plan` artifact template do not exist yet.
- Status/standup intent is served by `draft-status-update` rather than profile-named recipes.
