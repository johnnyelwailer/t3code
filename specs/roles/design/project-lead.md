# Role Design Spec: Project Lead (`project-lead`)

> Draft for iteration. Pairs with the implementation-status mapping in
> [../project-lead.md](../project-lead.md).

## 1. Who this is for

Project Leads / Projektleiter who coordinate delivery: they track status, blockers, and
dependencies, run toward milestones and releases, and keep stakeholders informed. They
care about flow and predictability, not implementation detail.

## 2. Recommended configuration

| Field | Recommended value | Rationale |
| --- | --- | --- |
| `audience` | `delivery` | *(matches code)* |
| `communicationStyle.technicalDepth` | `low` | Coordination role; abstract over code. *(matches code)* |
| `communicationStyle.brevity` | `short` | Status work rewards scannable output. *(matches code)* |
| `communicationStyle.guidanceStyle` | `guided` | *(matches code)* |
| `surfaceDefaults.detailDensity` | `guided` | *(matches code)* |
| `surfaceDefaults.activityOrder` | `newest-first` | Latest movement first for standups. *(matches code)* |
| `surfaceDefaults.collapseLowSignalEvents` | `true` | Surface blockers and state changes; hide noise. *(matches code)* |
| `hideImplementationComplexity` | `true` | *(matches code)* |
| `tags` | `delivery`, `coordination`, `planning` | *(matches code)* |
| `preferredArtifactKinds` | `status-report`, `risk-register`, `dependency-map`, `milestone-plan`, `standup-summary` | *(matches code)* |
| `defaultActionFamilies` | `delivery`, `release` | *(matches code)* |
| `recommendedSkillPackIds` | `delivery`, `release` | *(matches code)* |

**`defaultRecipeWeights` (existing recipes only):**

| Recipe | Weight | Note |
| --- | --- | --- |
| `draft-status-update` | 30 | Core daily move. *(matches code)* |
| `release-handoff-checklist` | 25 | *(matches code)* |
| `summarize-project-risk` | 20 | *(matches code)* |
| `focus-needs-my-action` | 15 | Triage what's waiting on the PL. *(proposed addition)* |
| `unblock-blocked-ticket` | 10 | Drive blockers to a next move. *(proposed addition)* |

> Both *(proposed addition)* rows reference recipes that **already exist** and are included
> in §8.

## 3. Tone & communication

- **Status-first and scannable.** Lead with done / in progress / blocked / next, then the
  single most important risk or dependency.
- **Name owners and dates.** Always attach ownership to a next step.
- **Escalate, don't solve.** For technical blockers, identify the blocker and the owner;
  do not attempt the technical fix.
- **Neutral and factual.** Avoid optimism bias — report slippage plainly.
- Keep it short; offer dependency/risk detail as a drill-down.

## 4. Recipes that fit

### Available today

- **`draft-status-update`** — concise done/in-progress/blocked/next + top dependency.
  Emits `status-update`, `blocker-list`.
- **`summarize-project-risk`** — blockers, unclear work, dependency risk, next actions.
- **`focus-needs-my-action`** — narrow the board to what's waiting on me, rank the next
  move. Emits `priority-list`, `next-step`.
- **`prioritize-pending-work`** — now/next/later ranking of the visible view.
- **`unblock-blocked-ticket`** — next move to reopen progress, with owner + fallback.
- **`re-scope-ticket-overrun`** — split / defer / finish on overruns.
- **`release-handoff-checklist`** — what changed, what to verify, rollout blockers,
  ownership. Emits `checklist`, `handoff-note`, `verification-plan`.
- **`prepare-post-merge-closeout`** — remaining Jira/QA/comms steps after merge.

### Proposed (not yet authored)

| Suggested id | Intent | Suggested artifacts | Suggested pack |
| --- | --- | --- | --- |
| `build-dependency-map` | Map cross-team / cross-ticket dependencies; flag the critical path. | `dependency-map`, `risk-register` | `delivery` |
| `draft-milestone-plan` | Milestones with scope, dates, and at-risk items. | `milestone-plan`, `risk-register` | `delivery` |
| `weekly-status-report` | Structured weekly stakeholder report (vs. the lighter `draft-status-update`). | `status-report` | `delivery` |
| `standup-summary` | One-paragraph standup digest from recent activity. | `standup-summary` | `delivery` |

## 5. Workflows that fit

### Workflow: Weekly status pack

1. `tool` — read project summary, recent activity, blockers.
2. `agent` — `summarize-project-risk`: blockers + dependency risk.
3. `agent` — `weekly-status-report`: structured roll-up.
4. `agent` — `stakeholder-update` (optional): low-jargon external version.
5. `present-message` — `status-report` (+ external draft) ready to circulate.

### Workflow: Milestone readiness check

1. `tool` — read milestone scope + linked work state.
2. `agent` — `build-dependency-map`: critical path + at-risk dependencies.
3. `agent` — `release-handoff-checklist`: what must be verified before the gate.
4. `present-message` — readiness view with `dependency-map` + open blockers.

## 6. Skill packs & supporting assets

- **Recommended packs (today):** `delivery`, `release`.
- **Proposed pack additions:** add `build-dependency-map`, `draft-milestone-plan`,
  `weekly-status-report`, `standup-summary` to the `delivery` pack.
- **Prompt blocks (proposed):** `delivery.status-format` (done/in-progress/blocked/next
  template), `delivery.escalation-tone` (neutral escalation phrasing).
- **Artifact templates needed:** `status-report`, `risk-register`, `dependency-map`,
  `milestone-plan`, `standup-summary` (today only `status-update`, `checklist`,
  `handoff-note`, `blocker-list` exist via current recipes).
- **Allowed tool groups:** default `integration.read`, `artifact.rw`, `ui.render`, plus
  `view.state` for board filtering.

## 7. Surface, safety & follow-ups

- **Sidecar sections:** default composition is fine. Aspirational: an `open-blockers`
  section leading the my-work surface.
- **Mutation safety posture:** **coordinate-not-mutate.** The PL drafts updates/checklists;
  status writes back to Jira should be preview-then-approve.
- **Follow-up suggestions:** after `summarize-project-risk`, suggest `draft-status-update`;
  after `unblock-blocked-ticket`, suggest `focus-needs-my-action`.
- **Default language:** unset; inherit workspace default.

## 8. Recommended profile definition (code)

```ts
"project-lead": {
  id: "project-lead",
  title: "Project Lead",
  description: "Concise status, blockers, dependencies, and milestone / release coordination.",
  audience: "delivery",
  tags: ["delivery", "coordination", "planning"],
  communicationStyle: { technicalDepth: "low", brevity: "short", guidanceStyle: "guided" },
  surfaceDefaults: {
    detailDensity: "guided",
    activityOrder: "newest-first",
    collapseLowSignalEvents: true,
  },
  preferredArtifactKinds: [
    "status-report",
    "risk-register",
    "dependency-map",
    "milestone-plan",
    "standup-summary",
  ],
  defaultActionFamilies: ["delivery", "release"],
  defaultRecipeWeights: {
    "draft-status-update": 30,
    "release-handoff-checklist": 25,
    "summarize-project-risk": 20,
    "focus-needs-my-action": 15,
    "unblock-blocked-ticket": 10,
  },
  recommendedSkillPackIds: ["delivery", "release"],
  hideImplementationComplexity: true,
},
```

## 9. Notes for iteration

- New artifact kinds need templates before the proposed recipes can emit them.
- `draft-status-update` (light, daily) vs. `weekly-status-report` (structured roll-up):
  keep both but differentiate clearly.
- Project Lead and Scrum Master overlap on status/blockers — decide which leads on the
  shared `delivery` surfaces.
