# t3work Role Profiles

One file per delivery role. Each documents:

1. **Profile** — what is *specified* for the role in
   [Epic 12 — Profiles And Skill Packs](../12-profiles-and-skill-packs.md).
2. **Skill pack** — the pack specified for the role and its recipes.
3. **Implemented today** — what actually exists in
   [`packages/t3work-skill-packs`](../../../packages/t3work-skill-packs/src) that serves
   the role right now (the closest bundled profile, implemented packs, and implemented
   recipes).
4. **Gaps** — specified vs. coded.

## ⚠️ Status at a glance

These role profiles are **specified, not yet implemented**. The shipped code in
[`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts) still defines six
**generic** bundled profiles — `qa-assistant`, `product-partner` (default),
`support-triage`, `delivery-coordinator`, `verification-guide`, `engineering-copilot` —
and six packs (`qa`, `product`, `support`, `delivery`, `engineering`, `release`) backed by
**21 bundled recipes** in [`recipes.ts`](../../../packages/t3work-skill-packs/src/recipes.ts).

Each role file maps the specified role onto those existing building blocks so you can see
what works today and what still needs to be authored.

The first six roles are specified in [Epic 12](../12-profiles-and-skill-packs.md). The
remaining five are **proposed additions** that extend the catalog beyond Epic 12 and are
not yet in the spec.

## Roles

### From Epic 12

| Role | File | Closest implemented profile |
| --- | --- | --- |
| Requirements Engineer (RE) | [requirements-engineer.md](./requirements-engineer.md) | `product-partner` / `qa-assistant` |
| Developer (Dev) | [developer.md](./developer.md) | `engineering-copilot` |
| Project Lead (PL / Projektleiter) | [project-lead.md](./project-lead.md) | `delivery-coordinator` |
| Product Owner / Proxy PO (PO / PPO) | [product-owner.md](./product-owner.md) | `product-partner` |
| Steering Member | [steering-member.md](./steering-member.md) | `delivery-coordinator` |
| Test Manager | [test-manager.md](./test-manager.md) | `qa-assistant` / `verification-guide` |

### Proposed additions (not yet in Epic 12)

| Role | File | Closest implemented profile |
| --- | --- | --- |
| Scrum Master (SM) | [scrum-master.md](./scrum-master.md) | `delivery-coordinator` |
| Cloud Engineer | [cloud-engineer.md](./cloud-engineer.md) | `engineering-copilot` |
| Service Manager | [service-manager.md](./service-manager.md) | `support-triage` / `delivery-coordinator` |
| System Administrator (SysAdmin) | [system-administrator.md](./system-administrator.md) | `engineering-copilot` |
| Security Engineer | [security-engineer.md](./security-engineer.md) | `engineering-copilot` |

## Reading the status flags

- ✅ **Implemented** — defined in code and usable now.
- 🟡 **Partial** — an implemented recipe/pack covers part of the role's intent.
- ⬜ **Specified only** — described in the spec, no code yet.
