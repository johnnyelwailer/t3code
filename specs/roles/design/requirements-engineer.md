# Role Design Spec: Requirements Engineer (`requirements-engineer`)

> Draft for iteration. Pairs with the implementation-status mapping in
> [../requirements-engineer.md](../requirements-engineer.md).

## 1. Who this is for

People who elicit, analyze, specify, and validate requirements: they turn vague intent
into testable, traceable acceptance criteria, surface ambiguity early, and keep
requirements linked back to tickets and tests. Product-adjacent but detail-oriented —
closer to analysis than to coding or stakeholder messaging.

## 2. Recommended configuration

| Field | Recommended value | Rationale |
| --- | --- | --- |
| `audience` | `product` | Analysis sits on the product side. *(matches code)* |
| `communicationStyle.technicalDepth` | `medium` | Reason about feasibility/testability without code. *(matches code)* |
| `communicationStyle.brevity` | `balanced` | Nuance matters; terseness loses edge cases. *(matches code)* |
| `communicationStyle.guidanceStyle` | `balanced` | The RE owns intent; the assistant assists. *(matches code)* |
| `surfaceDefaults.detailDensity` | `balanced` | *(matches code)* |
| `surfaceDefaults.activityOrder` | `newest-first` | *(matches code)* |
| `surfaceDefaults.collapseLowSignalEvents` | `true` | Focus on requirement-bearing changes. *(matches code)* |
| `hideImplementationComplexity` | `true` | RE reasons about *what*/*why*, not *how*. *(matches code)* |
| `tags` | `requirements`, `analysis`, `specification` | *(matches code)* |
| `preferredArtifactKinds` | `requirement-spec`, `acceptance-criteria`, `ambiguity-list`, `open-question-list`, `traceability-matrix` | *(matches code)* |
| `defaultActionFamilies` | `product`, `summary`, `verification` | `verification` keeps testability first-class. *(matches code)* |
| `recommendedSkillPackIds` | `product`, `qa` | Product framing + QA testability. *(matches code)* |

**`defaultRecipeWeights` (existing recipes only — what the matcher can score today):**

| Recipe | Weight | Note |
| --- | --- | --- |
| `review-acceptance-criteria` | 35 | Core RE move. *(matches code)* |
| `explain-selected-work` | 25 | Plain-language restatement + open questions. *(matches code)* |
| `create-qa-test-plan` | 10 | Bridge from requirement to testability. *(matches code)* |
| `summarize-project-risk` | 5 | *(matches code)* |

> Proposed recipes below would join these weights **once authored** (suggested:
> `clarify-requirement` 30, `find-ambiguity` 25, `write-acceptance-criteria` 25). They are
> omitted from the code today because the matcher only scores recipe ids that exist.

## 3. Tone & communication

- **Precise and neutral.** Mirror the requirement's own language; do not invent scope.
- **Lead with the gap, not the answer.** Surface what is unclear/untestable, then propose
  wording — never silently fill holes.
- **Always end with explicit open questions.** Unresolved ambiguity is a deliverable.
- **Phrase acceptance criteria as verifiable statements** (Given/When/Then or checklist).
- Avoid implementation detail and effort estimates unless asked.

## 4. Recipes that fit

### Available today

- **`review-acceptance-criteria`** — checklist, ambiguity warnings, missing-testability
  notes, pre-implementation questions. Emits `acceptance-criteria`, `open-questions`.
- **`explain-selected-work`** — plain-language summary + open questions. Emits `summary`,
  `open-questions`.

### Proposed (not yet authored)

| Suggested id | Intent | Suggested artifacts | Suggested pack |
| --- | --- | --- | --- |
| `clarify-requirement` | Turn a vague request into a structured requirement (actor, goal, constraints, rationale); flag the undefined. | `requirement-spec`, `open-question-list` | `requirements` |
| `find-ambiguity` | Scan for ambiguous terms, undefined quantifiers, conflicting statements. | `ambiguity-list` | `requirements` |
| `write-acceptance-criteria` | Given/When/Then criteria, each tagged with how it is verified. | `acceptance-criteria` | `requirements` |
| `derive-test-conditions` | Expand criteria into positive/negative/edge conditions (handoff to QA). | `test-matrix`, `open-questions` | `requirements`/`qa` |
| `trace-requirement` | Map a requirement to tickets/PRs/tests; flag untraced items. | `traceability-matrix` | `requirements` |

## 5. Workflows that fit

### Workflow: Refine a raw requirement

1. `collect-input` — capture the raw requirement / paste the ticket.
2. `tool` — read the selected work item + linked context.
3. `agent` — `clarify-requirement`: restate as a structured requirement.
4. `agent` — `find-ambiguity`: flag ambiguous/conflicting language.
5. `agent` — `write-acceptance-criteria`: testable criteria.
6. `present-message` — `requirement-spec` + `acceptance-criteria` + `open-question-list`.

### Workflow: Traceability sweep

1. `tool` — pull the requirement set for the project/epic.
2. `agent` — `trace-requirement`: build the matrix, mark gaps (no ticket / no test).
3. `present-message` — `traceability-matrix` with untraced rows highlighted.

## 6. Skill packs & supporting assets

- **Recommended packs (today):** `product`, `qa`.
- **Proposed pack:** `requirements` — default profile `requirements-engineer`; recipes
  `clarify-requirement`, `find-ambiguity`, `write-acceptance-criteria`,
  `derive-test-conditions`, `trace-requirement`; artifact templates `requirement-spec`,
  `ambiguity-list`, `traceability-matrix`.
- **Prompt blocks (proposed):** `requirements.house-style` (org wording conventions),
  `requirements.given-when-then` (AC format primer).
- **Artifact templates needed:** `requirement-spec`, `ambiguity-list`,
  `open-question-list`, `traceability-matrix` (only `acceptance-criteria` and `summary`
  exist via current recipes).
- **Allowed tool groups:** `integration.read`, `artifact.rw`, `ui.render` (default set —
  read-and-document only; no Jira mutations needed).

## 7. Surface, safety & follow-ups

- **Sidecar sections:** default composition is fine (`quick-starts`, then
  `recent-conversations`). Aspirational: an `open-questions` section surfacing unresolved
  items across the project.
- **Mutation safety posture:** **read-and-draft.** The RE drafts specs/criteria as
  artifacts; writing back to Jira should always be preview-then-approve.
- **Follow-up suggestions:** after `review-acceptance-criteria`, suggest
  `create-qa-test-plan` (testability handoff) and `explain-selected-work`.
- **Default language:** consider `de` (`communicationStyle.defaultLanguage`) for
  German-authored requirements in the Nexplore context — left unset by default.

## 8. Recommended profile definition (code)

```ts
"requirements-engineer": {
  id: "requirements-engineer",
  title: "Requirements Engineer",
  description:
    "Requirement clarity, acceptance criteria, and ambiguity checks with traceability in mind.",
  audience: "product",
  tags: ["requirements", "analysis", "specification"],
  communicationStyle: { technicalDepth: "medium", brevity: "balanced", guidanceStyle: "balanced" },
  surfaceDefaults: {
    detailDensity: "balanced",
    activityOrder: "newest-first",
    collapseLowSignalEvents: true,
  },
  preferredArtifactKinds: [
    "requirement-spec",
    "acceptance-criteria",
    "ambiguity-list",
    "open-question-list",
    "traceability-matrix",
  ],
  defaultActionFamilies: ["product", "summary", "verification"],
  defaultRecipeWeights: {
    "review-acceptance-criteria": 35,
    "explain-selected-work": 25,
    "create-qa-test-plan": 10,
    "summarize-project-risk": 5,
  },
  recommendedSkillPackIds: ["product", "qa"],
  hideImplementationComplexity: true,
},
```

## 9. Notes for iteration

- New artifact kinds need templates before the proposed recipes can emit them.
- Decide whether `derive-test-conditions` lives here or hands off to the Test Manager —
  overlap with `create-qa-test-plan` / `build-coverage-matrix` is intentional, not a dup.
