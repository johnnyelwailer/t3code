# t3work Delivery Profiles

These are **delivery profiles** — the working styles a user picks during onboarding,
defined in [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts) as
`T3WorkProfile`s. They are **not** access/permission roles; "profile" here means a
delivery persona (Requirements Engineer, Developer, …), not an auth role.

One file per delivery profile. Each documents:

1. **Profile** — what is *specified* for the profile in
   [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
2. **Skill pack** — the pack specified for the profile and its recipes.
3. **Implemented today** — what actually exists in
   [`packages/t3work-skill-packs`](../../../packages/t3work-skill-packs/src) that serves
   the profile right now (the bundled profile, implemented packs, and implemented recipes).
4. **Gaps** — specified vs. coded.

## ⚠️ Status at a glance

The 11 delivery profiles below are now **implemented as bundled profiles** in
[`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts) — they replaced the
earlier six generic profiles (`qa-assistant`, `product-partner`, `support-triage`,
`delivery-coordinator`, `verification-guide`, `engineering-copilot`). The default profile
is now `product-owner`.

The bundled **profiles** exist, but the per-profile **skill packs and recipes** are only
partly implemented: the shipped catalog still has six packs (`qa`, `product`, `support`,
`delivery`, `engineering`, `release`) backed by **21 bundled recipes** in
[`recipes.ts`](../../../packages/t3work-skill-packs/src/recipes.ts). Each profile file maps
its specified intent onto those building blocks so you can see what works today and what
still needs to be authored (see each file's **Gaps**).

The first six profiles are specified in [Epic 12](../12-profiles-and-skill-packs.md). The
remaining five are **extensions** beyond Epic 12 and are not yet folded into that spec.

## Delivery profiles

### From Epic 12

| Delivery profile | File | Implemented profile id |
| --- | --- | --- |
| Requirements Engineer (RE) | [requirements-engineer.md](./requirements-engineer.md) | `requirements-engineer` |
| Developer (Dev) | [developer.md](./developer.md) | `developer` |
| Project Lead (PL / Projektleiter) | [project-lead.md](./project-lead.md) | `project-lead` |
| Product Owner / Proxy PO (PO / PPO) | [product-owner.md](./product-owner.md) | `product-owner` (default) |
| Steering Member | [steering-member.md](./steering-member.md) | `steering-member` |
| Test Manager | [test-manager.md](./test-manager.md) | `test-manager` |

### Extensions (not yet in Epic 12)

| Delivery profile | File | Implemented profile id |
| --- | --- | --- |
| Scrum Master (SM) | [scrum-master.md](./scrum-master.md) | `scrum-master` |
| Cloud Engineer | [cloud-engineer.md](./cloud-engineer.md) | `cloud-engineer` |
| Service Manager | [service-manager.md](./service-manager.md) | `service-manager` |
| System Administrator (SysAdmin) | [system-administrator.md](./system-administrator.md) | `system-administrator` |
| Security Engineer | [security-engineer.md](./security-engineer.md) | `security-engineer` |

## Reading the status flags

- ✅ **Implemented** — defined in code and usable now.
- 🟡 **Partial** — an implemented recipe/pack covers part of the profile's intent.
- ⬜ **Specified only** — described in the spec, no code yet.
