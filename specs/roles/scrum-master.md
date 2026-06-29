# Delivery Profile: Scrum Master (SM)

> **Proposed profile — not in [Epic 12](../12-profiles-and-skill-packs.md) yet.** This extends
> the profile catalog beyond the original six.
>
> **Implementation status:** 🟡 Partial. The `scrum-master` profile now ships in
> [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts) (it replaced the
> generic `delivery-coordinator`). Its dedicated `scrum` pack and sprint-scoped recipes are
> still gaps — see [§3](#3-what-serves-this-profile-today) and [§4](#4-gaps).

For Scrum Masters facilitating team flow: sprint health, impediment removal, ceremony
prep, and concise team-facing updates. Process-first, low ceremony noise.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `scrum-master` |
| `title` | Scrum Master |
| `tags` | `agile`, `facilitation`, `delivery` |
| `communicationStyle.technicalDepth` | `low` |
| `communicationStyle.brevity` | `short` |
| `communicationStyle.guidanceStyle` | `guided` |
| `surfaceDefaults.detailDensity` | `guided` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `sprint-health`, `impediment-list`, `ceremony-notes`, `status-update`, `blocker-list` |
| `defaultActionFamilies` | `delivery`, `summarize`, `facilitate` |

## 2. Skill pack & recipes (specified)

**Scrum Pack** — default profile: Scrum Master. (No `scrum` pack exists; closest is `delivery`.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Surface sprint impediments / blockers | ✅ Implemented | `unblock-my-work`, `unblock-blocked-ticket` |
| Draft sprint / standup status update | ✅ Implemented | `draft-status-update` |
| Show what needs my action | ✅ Implemented | `focus-needs-my-action` |
| Prepare sprint planning slice | ✅ Implemented | `shape-next-backlog-slice`, `prioritize-pending-work` |
| Summarize sprint risk | 🟡 Partial | `summarize-project-risk` (project-scoped, not sprint-scoped) |
| Prepare retro / ceremony notes | ⬜ Specified only | — (no retrospective recipe) |

## 3. What serves this profile today

> **Note:** The `scrum-master` profile now ships in `profiles.ts`; the mapping below reflects
> the generic `delivery-coordinator` profile it was derived from and the recipes usable today.

The `delivery` pack already does most of the Scrum Master's day-to-day flow work.

- **Profile basis (pre-rename):** `delivery-coordinator` — low depth, short, guided; tuned
  for status, blockers, and dependencies.
- **Implemented pack:** `delivery`.
- **Implemented recipes usable now:**
  - ✅ `draft-status-update` — standup / sprint update.
  - ✅ `unblock-my-work`, `unblock-blocked-ticket` — impediment surfacing and resolution paths.
  - ✅ `focus-needs-my-action` — what the team/SM needs to act on.
  - ✅ `shape-next-backlog-slice`, `prioritize-pending-work` — planning prep.
  - 🟡 `summarize-project-risk` — risk view, but not sprint-bounded.

## 4. Gaps

- ✅ Profile `scrum-master` is now defined in `profiles.ts` (it replaced `delivery-coordinator`).
- ⬜ No `scrum` pack; no **sprint-scoped** rollups (current recipes are project-scoped).
- ⬜ No retrospective / ceremony-notes recipe or `ceremony-notes` artifact.
- ⬜ No `sprint-health` or velocity artifact template.
