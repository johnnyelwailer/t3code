# Role: Steering Member

> Specified in [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
>
> **Implementation status:** ⬜ Specified only — the least-covered role. No steering profile,
> pack, or executive recipes exist in code. See [§3](#3-what-serves-this-role-today).

For steering-committee members focused on governance, go/no-go decisions, and
portfolio-level risk: executive summaries first, decision briefs, budget/schedule at a
glance, escalations.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `steering-member` |
| `title` | Steering Member |
| `tags` | `governance`, `executive`, `oversight` |
| `communicationStyle.technicalDepth` | `low` |
| `communicationStyle.brevity` | `short` |
| `communicationStyle.guidanceStyle` | `expert` (self-serve) |
| `surfaceDefaults.detailDensity` | `guided` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `executive-summary`, `decision-brief`, `portfolio-risk`, `budget-schedule-overview`, `escalation-summary` |
| `defaultActionFamilies` | `summarize`, `decide`, `escalate` |

## 2. Skill pack & recipes (specified)

**Steering Pack** — default profile: Steering Member.

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Create executive summary | ⬜ Specified only | — (closest: `summarize-project-risk`) |
| Draft decision brief | ⬜ Specified only | — (artifact `decision-notes` exists) |
| Create portfolio risk overview | 🟡 Partial | `summarize-project-risk` (single-project only) |
| Draft escalation summary | 🟡 Partial | `support-escalation-summary` (support-flavored, not governance) |

## 3. What serves this role today

There is **no governance/executive profile or pack** in the shipped code. Best available
substitutes:

- **Closest implemented profile:** `delivery-coordinator` — low depth, short, guided; the
  nearest match for concise executive-style summaries. (No `expert` self-serve executive
  profile exists.)
- **Implemented packs that overlap:** `delivery`.
- **Implemented recipes usable now:**
  - 🟡 `summarize-project-risk` — closest to a portfolio/executive risk view, but scoped to
    one project.
  - 🟡 `draft-status-update` / `stakeholder-update` — can stand in for an executive update.
  - 🟡 `support-escalation-summary` — escalation framing, but support-oriented.

## 4. Gaps (largest of all roles)

- ⬜ Profile id `steering-member` not defined.
- ⬜ Pack id `steering` not defined.
- ⬜ No recipes for `create-executive-summary`, `draft-decision-brief`,
  `portfolio-risk-overview`, or a governance-grade `escalation-summary`.
- ⬜ No artifact templates for `executive-summary`, `decision-brief`, `portfolio-risk`, or
  `budget-schedule-overview`.
- ⬜ No **portfolio / multi-project** scope: every implemented risk/status recipe operates
  on a single project, whereas this role needs cross-project rollups.
