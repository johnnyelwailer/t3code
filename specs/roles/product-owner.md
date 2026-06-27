# Role: Product Owner / Proxy Product Owner (PO / PPO)

> Specified in [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
>
> **Implementation status:** 🟡 Partial. No `product-owner` profile yet, but the implemented
> `product-partner` profile (the **current default**) and `product` pack cover much of this
> role. See [§3](#3-what-serves-this-role-today).

For product owners and proxy POs managing backlog, priorities, and stakeholder value:
backlog refinement, user-story shaping, prioritization rationale, stakeholder updates.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `product-owner` |
| `title` | Product Owner |
| `tags` | `product`, `backlog`, `prioritization` |
| `communicationStyle.technicalDepth` | `low` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `guided` |
| `surfaceDefaults.detailDensity` | `balanced` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `user-story`, `backlog-refinement`, `prioritization-rationale`, `stakeholder-update`, `scope-value-framing` |
| `defaultActionFamilies` | `refine`, `prioritize`, `communicate` |

## 2. Skill pack & recipes (specified)

**Product Pack** — default profile: Product Owner. (A `product` pack already exists in code
under `product-partner`; see §3.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Refine backlog item | 🟡 Partial | `shape-next-backlog-slice` ("Shape the next backlog slice") |
| Write user story | ⬜ Specified only | — |
| Draft prioritization rationale | 🟡 Partial | `prioritize-pending-work` ("Prioritize pending work") |
| Draft stakeholder update | ✅ Implemented | `stakeholder-update` ("Draft stakeholder update") |
| Summarize requirement | 🟡 Partial | `explain-selected-work` ("Explain this simply") |
| Find ambiguity | 🟡 Partial | `review-acceptance-criteria` (ambiguity warnings) |

## 3. What serves this role today

- **Closest implemented profile:** `product-partner` — **the current default profile**
  (`DEFAULT_T3WORK_PROFILE_ID`). Low depth, short, guided; artifacts `summary`,
  `decision-notes`, `open-questions`, `status-update`; recommends `product`, `delivery`.
  Top weights: `stakeholder-update` 30, `explain-selected-work` 25,
  `review-acceptance-criteria` 20, `summarize-project-risk` 10.
- **Implemented packs that overlap:** `product`, `delivery`.
- **Implemented recipes usable now:**
  - ✅ `stakeholder-update` — low-jargon stakeholder/customer update.
  - ✅ `explain-selected-work` — plain-language summary of selected work.
  - ✅ `review-acceptance-criteria` — ambiguity & testability review.
  - ✅ `shape-next-backlog-slice` — choose the next 1–3 backlog items to pull forward.
  - ✅ `prioritize-pending-work` — rank now / next / later.
  - ✅ `summarize-project-risk` — risk grouping for the project.

## 4. Gaps

- ⬜ Profile id `product-owner` not defined; closest is `product-partner` (the default).
- ⬜ No `write-user-story` recipe and no `user-story` / `backlog-refinement` /
  `prioritization-rationale` artifact templates.
- Backlog/prioritization intent is served by the delivery-flavored
  `shape-next-backlog-slice` and `prioritize-pending-work` rather than PO-named recipes.
