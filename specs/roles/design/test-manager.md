# Role Design Spec: Test Manager (`test-manager`)

> Draft for iteration. Pairs with the implementation-status mapping in
> [../test-manager.md](../test-manager.md). Default profile for the `qa` and `release` packs.

## 1. Who this is for

Test Managers who own test strategy, coverage, and quality gates: they decide what gets
tested and to what depth, track defect risk, and sign off on release readiness from a
quality angle. They reason about coverage and risk more than about individual code
changes.

## 2. Recommended configuration

| Field | Recommended value | Rationale |
| --- | --- | --- |
| `audience` | `qa` | *(matches code)* |
| `communicationStyle.technicalDepth` | `medium` | Enough to judge testability/risk; not code-deep. *(matches code)* |
| `communicationStyle.brevity` | `balanced` | Coverage reasoning needs structure. *(matches code)* |
| `communicationStyle.guidanceStyle` | `balanced` | *(matches code)* |
| `surfaceDefaults.detailDensity` | `balanced` | *(matches code)* |
| `surfaceDefaults.activityOrder` | `newest-first` | *(matches code)* |
| `surfaceDefaults.collapseLowSignalEvents` | `true` | *(matches code)* |
| `hideImplementationComplexity` | `true` | Focus on quality outcomes, not internals. *(matches code)* |
| `tags` | `quality`, `test-management`, `qa` | *(matches code)* |
| `preferredArtifactKinds` | `test-strategy`, `test-plan`, `coverage-matrix`, `quality-gate-report`, `defect-risk-summary` | *(matches code)* |
| `defaultActionFamilies` | `qa`, `verification`, `release` | *(matches code)* |
| `recommendedSkillPackIds` | `qa`, `release` | *(matches code)* |

**`defaultRecipeWeights` (existing recipes only):**

| Recipe | Weight | Note |
| --- | --- | --- |
| `create-qa-test-plan` | 35 | Core move. *(matches code)* |
| `review-acceptance-criteria` | 20 | Testability gate before work starts. *(matches code)* |
| `release-handoff-checklist` | 10 | *(matches code)* |
| `summarize-project-risk` | 10 | Defect/delivery risk lens. *(matches code)* |

> Proposed recipes below would join these weights **once authored** (suggested:
> `define-test-strategy` 20, `quality-gate-report` 15, `build-coverage-matrix` 10).

## 3. Tone & communication

- **Risk- and coverage-oriented.** Frame everything as "what could break and how do we
  know it won't" — group by regression / smoke / edge.
- **Make gaps explicit.** State what is *not* covered and the residual risk of shipping.
- **Testability is a gate.** When acceptance criteria aren't verifiable, say so and block.
- **Balanced depth.** Enough technical context to design tests; readable for mixed QA/PM
  audiences.
- End with a clear go / caution / no-go signal where a gate decision is implied.

## 4. Recipes that fit

### Available today

- **`create-qa-test-plan`** — test matrix, environment assumptions, edge cases,
  regression vs smoke coverage, open questions. Emits `test-matrix`, `risk-list`,
  `checklist`. Gated to `technicalDepth: low|medium`.
- **`review-acceptance-criteria`** — ambiguity + missing testability + pre-impl questions.
  Emits `acceptance-criteria`, `open-questions`.
- **`summarize-project-risk`** — blockers, unclear work, risk hotspots.
- **`release-handoff-checklist`** — what to verify before rollout, blockers, ownership.

### Proposed (not yet authored)

| Suggested id | Intent | Suggested artifacts | Suggested pack |
| --- | --- | --- | --- |
| `define-test-strategy` | Overall approach for an epic/release: scope, levels (unit/integration/E2E), environments, entry/exit criteria. | `test-strategy` | `qa` |
| `build-coverage-matrix` | Map requirements/acceptance criteria to test cases; flag uncovered criteria. | `coverage-matrix` | `qa` |
| `quality-gate-report` | Release readiness from a quality view: coverage, open defects, residual risk, go/no-go. | `quality-gate-report` | `qa`/`release` |
| `defect-risk-summary` | Defect trends and the highest-risk areas to test next. | `defect-risk-summary` | `qa` |

## 5. Workflows that fit

### Workflow: Plan QA for an epic

1. `tool` — read the epic + child stories + acceptance criteria.
2. `agent` — `review-acceptance-criteria`: confirm criteria are testable; flag gaps.
3. `agent` — `define-test-strategy`: levels, environments, entry/exit criteria.
4. `agent` — `create-qa-test-plan`: the concrete matrix.
5. `agent` — `build-coverage-matrix`: map criteria → cases, flag uncovered.
6. `present-message` — `test-strategy` + `test-plan` + `coverage-matrix`.

### Workflow: Release quality gate

1. `tool` — read release scope, linked test results, open defects.
2. `agent` — `defect-risk-summary`: highest-risk areas + trends.
3. `agent` — `quality-gate-report`: coverage + residual risk + go/no-go.
4. `present-message` — `quality-gate-report` with an explicit gate signal.

## 6. Skill packs & supporting assets

- **Recommended packs (today):** `qa`, `release`.
- **Proposed pack additions:** add `define-test-strategy`, `build-coverage-matrix`,
  `quality-gate-report`, `defect-risk-summary` to the `qa` pack (the last one may also
  belong in `release`).
- **Prompt blocks (proposed):** `qa.coverage-rubric` (regression/smoke/edge framing),
  `qa.gate-criteria` (go/no-go checklist).
- **Artifact templates needed:** `test-strategy`, `coverage-matrix`,
  `quality-gate-report`, `defect-risk-summary` (today `test-matrix`, `risk-list`,
  `checklist` exist via current recipes).
- **Allowed tool groups:** default `integration.read`, `artifact.rw`, `ui.render`.

## 7. Surface, safety & follow-ups

- **Sidecar sections:** default composition is fine. Aspirational: an `open-defects`
  section.
- **Mutation safety posture:** **read-and-draft.** Test plans and gate reports are
  artifacts; writing results/status to Jira should be preview-then-approve.
- **Follow-up suggestions:** after `review-acceptance-criteria`, suggest
  `create-qa-test-plan`; after `create-qa-test-plan`, suggest `release-handoff-checklist`.
- **Default language:** unset; inherit workspace default.

## 8. Recommended profile definition (code)

```ts
"test-manager": {
  id: "test-manager",
  title: "Test Manager",
  description: "Test strategy, coverage, quality gates, and defect-risk oversight.",
  audience: "qa",
  tags: ["quality", "test-management", "qa"],
  communicationStyle: { technicalDepth: "medium", brevity: "balanced", guidanceStyle: "balanced" },
  surfaceDefaults: {
    detailDensity: "balanced",
    activityOrder: "newest-first",
    collapseLowSignalEvents: true,
  },
  preferredArtifactKinds: [
    "test-strategy",
    "test-plan",
    "coverage-matrix",
    "quality-gate-report",
    "defect-risk-summary",
  ],
  defaultActionFamilies: ["qa", "verification", "release"],
  defaultRecipeWeights: {
    "create-qa-test-plan": 35,
    "review-acceptance-criteria": 20,
    "release-handoff-checklist": 10,
    "summarize-project-risk": 10,
  },
  recommendedSkillPackIds: ["qa", "release"],
  hideImplementationComplexity: true,
},
```

## 9. Notes for iteration

- New artifact kinds need templates before the proposed recipes can emit them.
- `create-qa-test-plan` is gated to `technicalDepth: low|medium`; this profile is `medium`,
  so it qualifies — keep that in mind if depth is raised.
- Overlap with Requirements Engineer: RE `derive-test-conditions` derives conditions from
  requirements; TM `build-coverage-matrix` maps them to executable cases. Keep the seam
  explicit.
