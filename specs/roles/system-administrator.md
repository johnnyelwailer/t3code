# Delivery Profile: System Administrator (SysAdmin)

> **Proposed profile — not in [Epic 12](../12-profiles-and-skill-packs.md) yet.** This extends
> the profile catalog beyond the original six.
>
> **Implementation status:** 🟡 Partial. The `system-administrator` profile now ships in
> [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts), but no operations
> pack or maintenance recipes exist yet. The `engineering` and `release` packs partially
> cover technical change and handoff. See [§3](#3-what-serves-this-profile-today) and
> [§4](#4-gaps).

For system administrators keeping systems healthy: maintenance and patching, access
reviews, operational runbooks, and incident response. Technical, procedure- and
safety-first.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `system-administrator` |
| `title` | System Administrator |
| `tags` | `operations`, `sysadmin`, `maintenance`, `infrastructure` |
| `communicationStyle.technicalDepth` | `high` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `expert` |
| `surfaceDefaults.detailDensity` | `expert` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `false` |
| `preferredArtifactKinds` | `runbook`, `maintenance-checklist`, `access-review`, `incident-summary`, `change-record` |
| `defaultActionFamilies` | `operations`, `engineering`, `verify` |

## 2. Skill pack & recipes (specified)

**Operations Pack** — default profile: System Administrator. (No `operations` pack exists;
closest are `engineering` and `release`.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Draft maintenance / change plan | 🟡 Partial | `technical-implementation-plan` (code-flavored) |
| Prepare change / handoff checklist | 🟡 Partial | `release-handoff-checklist` |
| Author operational runbook | ⬜ Specified only | — (no `runbook` artifact) |
| Conduct access review | ⬜ Specified only | — (no access/permission recipe) |
| Draft incident summary | 🟡 Partial | `support-escalation-summary` (support-flavored) |

## 3. What serves this profile today

> **Note:** The `system-administrator` profile now ships in `profiles.ts`; the mapping below
> reflects the generic profile it draws on and the recipes usable today.

There is **no operations/sysadmin pack** yet. The technical engineering blocks are the
nearest fit; it shares most gaps with [Cloud Engineer](./cloud-engineer.md).

- **Profile basis (pre-rename):** `engineering-copilot` — high depth, expert guidance,
  expert density; right altitude for operational procedures.
- **Implemented packs that overlap:** `engineering`, `release`.
- **Implemented recipes usable now:**
  - 🟡 `technical-implementation-plan` — usable for change planning, written for code.
  - 🟡 `release-handoff-checklist` — closest to a change/maintenance checklist.
  - 🟡 `support-escalation-summary` — incident framing.

## 4. Gaps

- ✅ Profile `system-administrator` is now defined in `profiles.ts` (pack and recipes still missing).
- ⬜ No `operations` pack; no maintenance, patching, access-review, or change-record recipes.
- ⬜ No artifact templates for `runbook`, `maintenance-checklist`, `access-review`, or
  `change-record`.
- ⬜ No systems/infra inventory or access source feeding a recipe today.
