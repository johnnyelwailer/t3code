# Role Design Spec: Developer (`developer`)

> Draft for iteration. Pairs with the implementation-status mapping in
> [../developer.md](../developer.md). This is the best-covered role today.

## 1. Who this is for

Developers implementing tickets: they want implementation plans, codebase-aware
checklists, verification steps, and diff-first review defaults. They are comfortable with
full technical depth and prefer expert, low-hand-holding output.

## 2. Recommended configuration

| Field | Recommended value | Rationale |
| --- | --- | --- |
| `audience` | `engineering` | *(matches code)* |
| `communicationStyle.technicalDepth` | `high` | Show the real mechanics. *(matches code)* |
| `communicationStyle.brevity` | `balanced` | Plans need enough detail to act on. *(matches code)* |
| `communicationStyle.guidanceStyle` | `expert` | Assume competence; skip basics. *(matches code)* |
| `surfaceDefaults.detailDensity` | `expert` | *(matches code)* |
| `surfaceDefaults.activityOrder` | `newest-first` | *(matches code)* |
| `surfaceDefaults.collapseLowSignalEvents` | `false` | Devs want full signal. *(matches code)* |
| `hideImplementationComplexity` | `false` | The complexity *is* the job. *(matches code)* |
| `tags` | `engineering`, `implementation` | *(matches code)* |
| `preferredArtifactKinds` | `implementation-plan`, `technical-checklist`, `verification-plan`, `diff-summary` | *(matches code)* |
| `defaultActionFamilies` | `engineering`, `verification`, `release` | Added `verification` so PR-feedback / verification recipes score for devs. *(proposed change)* |
| `recommendedSkillPackIds` | `engineering`, `release` | *(matches code)* |
| `sidecarSections` | `recent-conversations`, then `quick-starts` | Only profile with a sidecar override — leads with thread continuity. *(matches code)* |

**`defaultRecipeWeights` (existing recipes only):**

| Recipe | Weight | Note |
| --- | --- | --- |
| `technical-implementation-plan` | 40 | Core Dev move. *(matches code)* |
| `address-linked-pr-feedback` | 20 | PR review turnaround. *(proposed addition)* |
| `release-handoff-checklist` | 10 | *(matches code)* |
| `next-best-task` | 10 | *(matches code)* |
| `review-acceptance-criteria` | 10 | Confirm understanding before coding. *(proposed addition)* |

> The *(proposed addition)* rows reference recipes that **already exist** and are included
> in §8. `defaultActionFamilies` gains `verification` (a real recipe family); the spec's
> aspirational `review`/`verify` families are **not** added because no recipe carries them
> yet — they would be dead weights in the matcher.

## 3. Tone & communication

- **Diff-first and concrete.** Reference real files/areas, propose the smallest safe
  change order, show what to verify.
- **Expert register.** Skip basics; assume the reader can read code.
- **Surface failure modes and edge cases** proactively.
- **Separate must-fix from optional**, especially for review feedback — rank by risk and
  blast radius.
- Favor checklists, ordered steps, and code references over paragraphs.

## 4. Recipes that fit

### Available today

- **`technical-implementation-plan`** — impacted areas, rollout order, failure modes,
  validation, pre-coding clarifications. Emits `implementation-plan`, `technical-checklist`,
  `verification-plan`. Gated to `technicalDepth: high`.
- **`address-linked-pr-feedback`** — summarize open review requests/comments, split
  must-fix vs optional, smallest safe change order. Emits `implementation-plan`,
  `verification-plan`, `open-questions`.
- **`review-acceptance-criteria`** — confirm the ticket is understood/testable first.
- **`next-best-task`** — highest-leverage next task with dependencies/blockers.
- **`release-handoff-checklist`** / **`prepare-post-merge-closeout`** — wrap-up after code
  lands.
- **`unblock-blocked-ticket`** — next move + owner when blocked.

### Proposed (not yet authored)

| Suggested id | Intent | Suggested artifacts | Suggested pack |
| --- | --- | --- | --- |
| `convert-ticket-to-technical-checklist` | Standalone ordered technical checklist (lighter than the full plan). | `technical-checklist` | `engineering` |
| `identify-likely-repo-areas` | Given a ticket + repo access, point to the files/modules most likely to change. | `code-reference` | `engineering` |
| `explain-what-changed-in-pr` | Plain technical summary of a PR diff (intent, risk, test coverage). | `diff-summary` | `engineering`/`release` |
| `draft-verification-plan` | Standalone verification/test plan for a change. | `verification-plan` | `engineering` |

## 5. Workflows that fit

### Workflow: Implement a ticket end-to-end

1. `tool` — read the ticket summary + linked context; pull repo signals if available.
2. `agent` — `review-acceptance-criteria`: confirm scope is clear/testable.
3. `agent` — `identify-likely-repo-areas`: where the change lands.
4. `agent` — `technical-implementation-plan`: sequencing, failure modes, validation.
5. `present-message` — `implementation-plan` + `technical-checklist` + `verification-plan`.

### Workflow: Respond to PR review

1. `tool` — read linked PR activity (review requests + comments).
2. `agent` — `address-linked-pr-feedback`: must-fix vs optional, smallest safe order.
3. `agent` — `draft-verification-plan`: how to confirm each fix.
4. `present-message` — change order + `verification-plan` + anything needing clarification.

## 6. Skill packs & supporting assets

- **Recommended packs (today):** `engineering`, `release`.
- **Proposed pack additions:** add `convert-ticket-to-technical-checklist`,
  `identify-likely-repo-areas`, `explain-what-changed-in-pr`, `draft-verification-plan` to
  the `engineering` pack.
- **Prompt blocks (proposed):** `engineering.house-conventions` (repo style/test norms),
  `engineering.review-priority` (must-fix vs optional rubric).
- **Artifact templates needed:** `code-reference`, `diff-summary` (today
  `implementation-plan`, `technical-checklist`, `verification-plan` exist via recipes).
- **Allowed tool groups:** default `integration.read`, `artifact.rw`, `ui.render`. If repo
  read/write is enabled, add the repo tool group; keep code writes preview-then-approve
  (the existing edit recipes already gate on a diff approval step).

## 7. Surface, safety & follow-ups

- **Sidecar sections:** keep the code default — `recent-conversations` first, then
  `quick-starts` (devs resume threads more than they browse quick starts). Aspirational:
  an `open-pull-requests` section.
- **Mutation safety posture:** **diff-first, approval-gated.** Any code or Jira write must
  show a diff/preview and require explicit approval before applying.
- **Follow-up suggestions:** after `technical-implementation-plan`, suggest
  `address-linked-pr-feedback` and `release-handoff-checklist`.
- **Default language:** unset; inherit workspace default.

## 8. Recommended profile definition (code)

```ts
developer: {
  id: "developer",
  title: "Developer",
  description:
    "Technical implementation guidance with diff-first and verification-oriented defaults.",
  audience: "engineering",
  tags: ["engineering", "implementation"],
  communicationStyle: { technicalDepth: "high", brevity: "balanced", guidanceStyle: "expert" },
  surfaceDefaults: {
    detailDensity: "expert",
    activityOrder: "newest-first",
    collapseLowSignalEvents: false,
  },
  preferredArtifactKinds: [
    "implementation-plan",
    "technical-checklist",
    "verification-plan",
    "diff-summary",
  ],
  defaultActionFamilies: ["engineering", "verification", "release"],
  defaultRecipeWeights: {
    "technical-implementation-plan": 40,
    "address-linked-pr-feedback": 20,
    "release-handoff-checklist": 10,
    "next-best-task": 10,
    "review-acceptance-criteria": 10,
  },
  sidecarSections: {
    sections: [{ sectionId: "recent-conversations" }, { sectionId: "quick-starts" }],
  },
  recommendedSkillPackIds: ["engineering", "release"],
  hideImplementationComplexity: false,
},
```

## 9. Notes for iteration

- Spec's stated `defaultActionFamilies` are `engineering`, `review`, `verify`; code uses
  real recipe families (`engineering`, `verification`, `release`). Reconcile the spec
  vocabulary or add recipes that carry `review`.
- `code-reference` and `diff-summary` artifact kinds need templates.
- `convert-ticket-to-technical-checklist` / `draft-verification-plan` partly overlap with
  `technical-implementation-plan`; keep them as lighter standalone actions.
