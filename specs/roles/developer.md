# Role: Developer (Dev)

> Specified in [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
>
> **Implementation status:** 🟡 Partial. No `developer` profile exists yet, but the
> implemented `engineering-copilot` profile and `engineering` pack already cover most of
> this role. See [§3](#3-what-serves-this-role-today).

For developers implementing tickets: implementation plans, codebase references, technical
checklists, verification steps; diff-first review defaults.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `developer` |
| `title` | Developer |
| `tags` | `engineering`, `implementation` |
| `communicationStyle.technicalDepth` | `high` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `expert` |
| `surfaceDefaults.detailDensity` | `expert` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `false` |
| `preferredArtifactKinds` | `implementation-plan`, `technical-checklist`, `code-reference`, `verification-plan` |
| `defaultActionFamilies` | `engineering`, `review`, `verify` |

## 2. Skill pack & recipes (specified)

**Engineering Pack** — default profile: Developer. (The `engineering` pack already exists
in code under the `engineering-copilot` profile; see §3.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Draft implementation plan | ✅ Implemented | `technical-implementation-plan` ("Draft implementation plan") |
| Identify likely repo areas | 🟡 Partial | folded into `technical-implementation-plan` (covers "likely impacted areas") |
| Convert ticket to technical checklist | ⬜ Specified only | — (artifact `technical-checklist` emitted by `technical-implementation-plan`) |
| Draft verification plan | 🟡 Partial | `technical-implementation-plan` emits `verification-plan`; `address-linked-pr-feedback` also emits it |
| Explain what changed in this PR | 🟡 Partial | `address-linked-pr-feedback` ("Address linked PR feedback") |

## 3. What serves this role today

This is the best-covered role. The shipped `engineering-copilot` profile is effectively
the Developer profile under a different name.

- **Closest implemented profile:** `engineering-copilot` — `technicalDepth: high`,
  `guidanceStyle: expert`, `detailDensity: expert`, `hideImplementationComplexity: false`,
  artifacts `implementation-plan`, `technical-checklist`, `verification-plan`,
  `diff-summary`. It is the only bundled profile with a `sidecarSections` override.
- **Implemented pack:** `engineering` — `recipeIds`: `technical-implementation-plan`,
  `review-acceptance-criteria`, `next-best-task`; default profile `engineering-copilot`.
- **Implemented recipes usable now:**
  - ✅ `technical-implementation-plan` — "Draft implementation plan" (impacted areas, sequencing, failure modes, validation). Requires `engineering` pack; `technicalDepths: [high]`.
  - ✅ `address-linked-pr-feedback` — "Address linked PR feedback" (must-fix vs optional, smallest safe change order). Requires `engineering` pack.
  - ✅ `review-acceptance-criteria` — "Review acceptance criteria".
  - ✅ `next-best-task` — "Suggest next best task".

## 4. Gaps

- ⬜ Profile id `developer` not defined; behavior currently lives under `engineering-copilot`.
- ⬜ Pack id `engineering` exists but uses the generic recipe set above, not the specified
  Developer recipe list.
- ⬜ Dedicated recipes `identify-likely-repo-areas`, `convert-ticket-to-technical-checklist`,
  `draft-verification-plan`, `explain-what-changed-in-pr` are not defined as standalone
  recipes — their intent is partially folded into `technical-implementation-plan` and
  `address-linked-pr-feedback`.
