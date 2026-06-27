# Role: Test Manager

> Specified in [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
>
> **Implementation status:** 🟡 Partial. No `test-manager` profile yet, but the implemented
> `qa-assistant` and `verification-guide` profiles plus the `qa` pack cover the
> tester-level slice of this role. See [§3](#3-what-serves-this-role-today).

For test managers owning test strategy, coverage, quality gates, and defect oversight —
i.e. test **management**, a step above the individual QA tester.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `test-manager` |
| `title` | Test Manager |
| `tags` | `quality`, `test-management`, `qa` |
| `communicationStyle.technicalDepth` | `medium` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `balanced` |
| `surfaceDefaults.detailDensity` | `balanced` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `test-strategy`, `test-plan`, `coverage-matrix`, `quality-gate-report`, `defect-risk-summary` |
| `defaultActionFamilies` | `plan`, `assess`, `report` |

## 2. Skill pack & recipes (specified)

**Test Management Pack** — default profile: Test Manager.

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Create test strategy | ⬜ Specified only | — (management-level; closest is `create-qa-test-plan`, which is per-ticket) |
| Create test plan | 🟡 Partial | `create-qa-test-plan` ("Create QA test plan") — per-ticket, not program-level |
| Coverage gap analysis | ⬜ Specified only | — |
| Quality-gate report | ⬜ Specified only | — |
| Summarize defect risk | 🟡 Partial | `summarize-project-risk` (general risk, not defect-specific) |
| Review acceptance criteria | ✅ Implemented | `review-acceptance-criteria` ("Review acceptance criteria") |

## 3. What serves this role today

The shipped code covers the **individual QA tester** well, but not test **management**
(strategy, coverage, quality gates).

- **Closest implemented profiles:** `qa-assistant` (medium depth, short, guided; artifacts
  `test-matrix`, `risk-list`, `repro-steps`, `open-questions`, `checklist`) and
  `verification-guide` (medium depth, balanced; artifacts `checklist`,
  `verification-plan`, `risk-list`, `handoff-note`).
- **Implemented packs that overlap:** `qa`, `release`.
- **Implemented recipes usable now:**
  - ✅ `create-qa-test-plan` — test matrix, regression vs smoke, edge cases (per-ticket).
  - ✅ `review-acceptance-criteria` — ambiguity & testability review.
  - ✅ `summarize-project-risk` — project risk grouping.
  - ✅ `release-handoff-checklist` — verification/QA handoff.

## 4. Gaps

- ⬜ Profile id `test-manager` not defined; the closest profiles are tester-level
  (`qa-assistant`, `verification-guide`), not management-level.
- ⬜ Pack id `test-management` not defined; closest is `qa`.
- ⬜ No recipes for `create-test-strategy`, `coverage-gap-analysis`, or
  `quality-gate-report`, and no `summarize-defect-risk` distinct from general project risk.
- ⬜ No artifact templates for `test-strategy`, `coverage-matrix`, `quality-gate-report`, or
  `defect-risk-summary`.
- The implemented QA surface is **per-ticket**; the Test Manager role needs **program /
  release-wide** coverage and quality-gate views.

### Related note

The `qa` and `support` packs reference a recipe id `draft-jira-comment` that is **not
defined** anywhere in [`recipes.ts`](../../../packages/t3work-skill-packs/src/recipes.ts) —
a dangling reference that affects the QA pack this role would build on.
