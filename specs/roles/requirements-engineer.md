# Delivery Profile: Requirements Engineer (RE)

> Specified in [Epic 12 — Profiles And Skill Packs](../epics/12-profiles-and-skill-packs.md).
>
> **Implementation status:** 🟡 Partial. The `requirements-engineer` profile now ships in
> [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts). Its dedicated
> `requirements` pack and several specified recipes are still gaps — see
> [§3](#3-what-serves-this-profile-today) and [§4](#4-gaps).

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

This is the one profile with a full `T3WorkProfile` TS example in
[Epic 12 → Example profile instance](../epics/12-profiles-and-skill-packs.md#example-profile-instance).

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

## 3. What serves this profile today

> **Note:** The `requirements-engineer` profile now ships in `profiles.ts`; the mapping
> below reflects the generic profiles it draws on and the recipes usable today.

The dedicated `requirements` pack does not exist yet; the profile reuses existing
packs/recipes:

- **Profile basis (pre-rename):** `product-partner` (was the default) — low depth, guided; or
  `qa-assistant` when acceptance-review is the focus.
- **Implemented packs that overlap:** `product`, `qa`.
- **Implemented recipes usable now:**
  - ✅ [`review-acceptance-criteria`](../../../packages/t3work-skill-packs/src/recipes.ts) — "Review acceptance criteria": ambiguity, missing testability, follow-up questions. (Closest fit to the RE intent.)
  - ✅ `explain-selected-work` — "Explain this simply": plain-language summary + open questions.

## 4. Gaps

- ✅ Profile `requirements-engineer` is now defined in `profiles.ts`.
- ⬜ `requirements` pack not defined in [`skillPacks.ts`](../../../packages/t3work-skill-packs/src/skillPacks.ts).
- ⬜ Recipes `clarify-requirement`, `find-ambiguity`, `write-acceptance-criteria`,
  `derive-test-conditions`, `trace-requirement`, `create-open-question-list` are not in
  [`recipes.ts`](../../../packages/t3work-skill-packs/src/recipes.ts). Only
  `review-acceptance-criteria` exists as a near-equivalent.
- New artifact kinds (`requirement-spec`, `ambiguity-list`, `traceability-matrix`) have no
  artifact templates yet.
