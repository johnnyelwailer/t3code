# Role: System Administrator (SysAdmin)

> **Proposed role — not in [Epic 12](../12-profiles-and-skill-packs.md) yet.** This extends
> the role catalog beyond the original six.
>
> **Implementation status:** ⬜ Specified only. No sysadmin profile, pack, or
> operations/maintenance recipes exist. The `engineering` and `release` packs partially
> cover technical change and handoff. See [§3](#3-what-serves-this-role-today).

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

## 3. What serves this role today

There is **no operations/sysadmin profile or pack**. The technical engineering blocks are
the nearest fit; it shares most gaps with [Cloud Engineer](./cloud-engineer.md).

- **Closest implemented profile:** `engineering-copilot` — high depth, expert guidance,
  expert density; right altitude for operational procedures.
- **Implemented packs that overlap:** `engineering`, `release`.
- **Implemented recipes usable now:**
  - 🟡 `technical-implementation-plan` — usable for change planning, written for code.
  - 🟡 `release-handoff-checklist` — closest to a change/maintenance checklist.
  - 🟡 `support-escalation-summary` — incident framing.

## 4. Gaps

- ⬜ Profile id `system-administrator` not defined.
- ⬜ No `operations` pack; no maintenance, patching, access-review, or change-record recipes.
- ⬜ No artifact templates for `runbook`, `maintenance-checklist`, `access-review`, or
  `change-record`.
- ⬜ No systems/infra inventory or access source feeding a recipe today.
