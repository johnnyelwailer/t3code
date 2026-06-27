# Role: Requirements Engineer (RE)

> Specified in [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
>
> **Implementation status:** ⬜ Specified only. Not yet present in
> [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts). The mapping in
> [§3](#3-what-serves-this-role-today) shows what serves an RE in the shipped code now.

For requirements engineers who elicit, analyze, specify, and validate requirements;
surface ambiguity; and keep requirements traceable to tickets and tests.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `requirements-engineer` |
| `title` | Requirements Engineer |
| `tags` | `requirements`, `analysis`, `specification` |
| `communicationStyle.technicalDepth` | `medium` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `balanced` |
| `surfaceDefaults.detailDensity` | `balanced` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `requirement-spec`, `acceptance-criteria`, `ambiguity-list`, `open-question-list`, `traceability-matrix` |
| `defaultActionFamilies` | `analyze`, `clarify`, `document` |

`defaultRecipeWeights` (specified): `clarify-requirement` 1, `find-ambiguity` 0.9,
`write-acceptance-criteria` 0.9, `derive-test-conditions` 0.7, `trace-requirement` 0.6.

This is the one role with a full `T3WorkProfile` TS example in
[Epic 12 → Example profile instance](../12-profiles-and-skill-packs.md#example-profile-instance).

## 2. Skill pack & recipes (specified)

**Requirements Pack** — default profile: Requirements Engineer.

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Clarify requirement | ⬜ Specified only | — |
| Find ambiguity | ⬜ Specified only | — |
| Write acceptance criteria | 🟡 Partial | `review-acceptance-criteria` ("Review acceptance criteria") |
| Derive test conditions | ⬜ Specified only | — (closest: `create-qa-test-plan`) |
| Trace requirement to tickets | ⬜ Specified only | — |
| Create open question list | ⬜ Specified only | — (`explain-selected-work` emits `open-questions`) |

## 3. What serves this role today

The shipped code has no `requirements-engineer` profile or `requirements` pack. Closest
working setup:

- **Closest implemented profile:** `product-partner` (default) — low depth, guided; or
  `qa-assistant` when acceptance-review is the focus.
- **Implemented packs that overlap:** `product`, `qa`.
- **Implemented recipes usable now:**
  - ✅ [`review-acceptance-criteria`](../../../packages/t3work-skill-packs/src/recipes.ts) — "Review acceptance criteria": ambiguity, missing testability, follow-up questions. (Closest fit to the RE intent.)
  - ✅ `explain-selected-work` — "Explain this simply": plain-language summary + open questions.

## 4. Gaps

- ⬜ Profile `requirements-engineer` not defined in code.
- ⬜ `requirements` pack not defined in [`skillPacks.ts`](../../../packages/t3work-skill-packs/src/skillPacks.ts).
- ⬜ Recipes `clarify-requirement`, `find-ambiguity`, `write-acceptance-criteria`,
  `derive-test-conditions`, `trace-requirement`, `create-open-question-list` are not in
  [`recipes.ts`](../../../packages/t3work-skill-packs/src/recipes.ts). Only
  `review-acceptance-criteria` exists as a near-equivalent.
- New artifact kinds (`requirement-spec`, `ambiguity-list`, `traceability-matrix`) have no
  artifact templates yet.
