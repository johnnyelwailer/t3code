# Role: Service Manager

> **Proposed role — not in [Epic 12](../12-profiles-and-skill-packs.md) yet.** This extends
> the role catalog beyond the original six.
>
> **Implementation status:** ⬜ Specified only. No service-management profile, pack, or
> SLA/service-review recipes exist. The `support` and `delivery` packs partially cover
> incident and status framing. See [§3](#3-what-serves-this-role-today).

For service managers running the operational service: SLAs, incident and escalation
oversight, service reviews, and customer-facing status. Outcome- and impact-first, low
technical depth.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `service-manager` |
| `title` | Service Manager |
| `tags` | `service-management`, `itil`, `operations`, `support` |
| `communicationStyle.technicalDepth` | `low` |
| `communicationStyle.brevity` | `short` |
| `communicationStyle.guidanceStyle` | `guided` |
| `surfaceDefaults.detailDensity` | `guided` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `true` |
| `preferredArtifactKinds` | `sla-report`, `service-review`, `incident-summary`, `escalation-summary`, `status-update` |
| `defaultActionFamilies` | `support`, `summarize`, `escalate` |

## 2. Skill pack & recipes (specified)

**Service Management Pack** — default profile: Service Manager. (No `service` pack exists;
closest are `support` and `delivery`.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Draft incident / escalation summary | 🟡 Partial | `support-escalation-summary` |
| Draft service status update | ✅ Implemented | `draft-status-update`, `stakeholder-update` |
| Create SLA / breach report | ⬜ Specified only | — (no SLA recipe or `sla-report` artifact) |
| Prepare periodic service review | ⬜ Specified only | — (closest: `summarize-project-risk`) |

## 3. What serves this role today

There is **no service-management profile or pack**. Support and delivery building blocks
substitute partially.

- **Closest implemented profile:** `support-triage` — low depth, short, guided, escalation-
  and impact-first; closest to a service-management posture. `delivery-coordinator` is a
  fallback for status/review framing.
- **Implemented packs that overlap:** `support`, `delivery`.
- **Implemented recipes usable now:**
  - 🟡 `support-escalation-summary` — incident/escalation framing.
  - ✅ `draft-status-update` / `stakeholder-update` — service status.
  - 🟡 `summarize-project-risk` — stand-in for a service review (single-project scope).

## 4. Gaps

- ⬜ Profile id `service-manager` not defined.
- ⬜ No `service` pack; no SLA, service-review, or incident-lifecycle recipes.
- ⬜ No artifact templates for `sla-report`, `service-review`, or `incident-summary`.
- ⬜ No service/ITSM source integration; no SLA or incident data feeds a recipe today.
