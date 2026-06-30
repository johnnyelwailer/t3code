# Delivery Profile: Cloud Engineer

> **Proposed profile — not in [Epic 12](../epics/12-profiles-and-skill-packs.md) yet.** This extends
> the profile catalog beyond the original six.
>
> **Implementation status:** 🟡 Partial. The `cloud-engineer` profile now ships in
> [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts) (it provides the
> high-depth, diff-first defaults this profile needs). Its dedicated cloud/platform pack and
> recipes are still gaps — see [§3](#3-what-serves-this-profile-today) and [§4](#4-gaps).

For cloud / platform engineers: infrastructure-as-code changes, deployment and rollout
planning, runbooks, and verification of cloud resources. Technical depth high; safety- and
rollback-first defaults.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `cloud-engineer` |
| `title` | Cloud Engineer |
| `tags` | `infrastructure`, `cloud`, `platform`, `engineering` |
| `communicationStyle.technicalDepth` | `high` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `expert` |
| `surfaceDefaults.detailDensity` | `expert` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `false` |
| `preferredArtifactKinds` | `infra-plan`, `deployment-checklist`, `runbook`, `verification-plan`, `rollback-plan` |
| `defaultActionFamilies` | `engineering`, `release`, `verify` |

## 2. Skill pack & recipes (specified)

**Cloud / Platform Pack** — default profile: Cloud Engineer. (No `cloud` pack exists;
closest are `engineering` and `release`.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Draft infrastructure change plan | 🟡 Partial | `technical-implementation-plan` (code-flavored, not infra) |
| Prepare deployment / rollout checklist | 🟡 Partial | `release-handoff-checklist` |
| Draft rollback plan | ⬜ Specified only | — (no rollback recipe) |
| Author runbook | ⬜ Specified only | — (no `runbook` artifact) |
| Verify deployed resources | 🟡 Partial | `technical-implementation-plan` emits `verification-plan` |

## 3. What serves this profile today

> **Note:** The `cloud-engineer` profile now ships in `profiles.ts`; the mapping below
> reflects the generic profile it draws on and the recipes usable today.

There is **no infra/cloud pack** yet; the technical engineering building blocks are the
nearest fit for recipes.

- **Profile basis (pre-rename):** `engineering-copilot` — `technicalDepth: high`,
  `guidanceStyle: expert`, `detailDensity: expert`; the right altitude for infra work.
- **Implemented packs that overlap:** `engineering`, `release`.
- **Implemented recipes usable now:**
  - 🟡 `technical-implementation-plan` — works for infra changes but is written for code
    (impacted areas, sequencing, failure modes, validation).
  - 🟡 `release-handoff-checklist` — closest to a deployment checklist.

## 4. Gaps

- ✅ Profile `cloud-engineer` is now defined in `profiles.ts` (pack and recipes still missing).
- ⬜ No `cloud`/`platform` pack; no IaC-, deployment-, or rollback-specific recipes.
- ⬜ No artifact templates for `infra-plan`, `deployment-checklist`, `runbook`, or
  `rollback-plan`.
- ⬜ No cloud-provider resource context (no integration surfaces infra state today).
