# Role: Security Engineer

> **Proposed role — not in [Epic 12](../12-profiles-and-skill-packs.md) yet.** This extends
> the role catalog beyond the original six.
>
> **Implementation status:** ⬜ Specified only. No security profile, pack, or
> threat-model / vulnerability / remediation recipes exist. `engineering-copilot` provides
> the right technical altitude but none of the security recipes. See
> [§3](#3-what-serves-this-role-today).

For security engineers: threat modeling, vulnerability assessment, security review of
changes, and remediation planning. Technical depth high; risk- and evidence-first, with no
implementation complexity hidden.

## 1. Profile (specified)

| Field | Value |
| --- | --- |
| `id` | `security-engineer` |
| `title` | Security Engineer |
| `tags` | `security`, `appsec`, `risk`, `engineering` |
| `communicationStyle.technicalDepth` | `high` |
| `communicationStyle.brevity` | `balanced` |
| `communicationStyle.guidanceStyle` | `expert` |
| `surfaceDefaults.detailDensity` | `expert` |
| `surfaceDefaults.activityOrder` | `newest-first` |
| `surfaceDefaults.collapseLowSignalEvents` | `false` |
| `preferredArtifactKinds` | `threat-model`, `security-review`, `vulnerability-report`, `remediation-plan`, `risk-list` |
| `defaultActionFamilies` | `security`, `engineering`, `verify` |

## 2. Skill pack & recipes (specified)

**Security Pack** — default profile: Security Engineer. (No `security` pack exists; closest
is `engineering`.)

| Recipe (specified) | Status | Maps to implemented recipe |
| --- | --- | --- |
| Security review of a change | 🟡 Partial | `review-acceptance-criteria` / `address-linked-pr-feedback` (not security-specific) |
| Draft threat model | ⬜ Specified only | — (no `threat-model` artifact) |
| Triage / report vulnerabilities | ⬜ Specified only | — (no vulnerability recipe) |
| Draft remediation plan | 🟡 Partial | `technical-implementation-plan` (generic, not risk-ranked) |
| List security risks | 🟡 Partial | `summarize-project-risk` (delivery risk, not security risk) |

## 3. What serves this role today

There is **no security profile, pack, or recipe**. Only the technical altitude transfers;
the security substance must be authored. This is among the least-covered proposed roles.

- **Closest implemented profile:** `engineering-copilot` — high depth, expert guidance,
  `hideImplementationComplexity: false`; the right posture, none of the security content.
- **Implemented packs that overlap:** `engineering` (review framing only).
- **Implemented recipes usable now:**
  - 🟡 `address-linked-pr-feedback` / `review-acceptance-criteria` — generic review, can be
    pointed at security concerns by the user but encode no security knowledge.
  - 🟡 `technical-implementation-plan` — stand-in for a remediation plan, not risk-ranked.

## 4. Gaps (large)

- ⬜ Profile id `security-engineer` not defined.
- ⬜ No `security` pack; no threat-modeling, vulnerability-triage, or remediation recipes.
- ⬜ No artifact templates for `threat-model`, `security-review`, `vulnerability-report`, or
  `remediation-plan`.
- ⬜ No `security` action family; no security scanner / advisory source feeding a recipe.
- ⬜ Security risk is conflated with delivery risk — no security-specific risk model exists.
