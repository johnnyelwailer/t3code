# Role Design Specs

Forward-looking **design** specs for the delivery-role profiles: recommended
configuration, tone, and the recipes and workflows that fit each role.

These are **drafts to refine and iterate on**. They are distinct from the
implementation-status mapping files one level up (`../<role>.md`), which record what is
*coded today* vs. *specified*. A design spec here says what the role *should* feel like
and do; the mapping file says how far the shipped code is from that.

## How to read each spec

1. **Who this is for** — the human the profile serves.
2. **Recommended configuration** — concrete `T3WorkProfile` field values, with rationale.
   Where a value matches the shipped [`profiles.ts`](../../../packages/t3work-skill-packs/src/profiles.ts),
   it is marked *(matches code)*; proposed changes are marked *(proposed)*.
3. **Tone & communication** — how the assistant should sound for this role.
4. **Recipes that fit** — split into **Available today** (real bundled recipes from
   [`recipes.ts`](../../../packages/t3work-skill-packs/src/recipes.ts)) and **Proposed**
   (not yet authored; suggested id + intent).
5. **Workflows that fit** — multi-step kickoff flows (the `kickoff.steps` model used by
   bundled recipes) that chain several actions into one guided sequence.
6. **Notes for iteration** — open questions and tuning levers.

## Specs in this folder

| Role | File | Default profile in code |
| --- | --- | --- |
| Requirements Engineer | [requirements-engineer.md](./requirements-engineer.md) | `requirements-engineer` |
| Product Owner | [product-owner.md](./product-owner.md) | `product-owner` (system default) |
| Project Lead | [project-lead.md](./project-lead.md) | `project-lead` |
| Developer | [developer.md](./developer.md) | `developer` |
| Test Manager | [test-manager.md](./test-manager.md) | `test-manager` |

## Shared vocabulary (today)

**Skill packs:** `qa`, `product`, `support`, `delivery`, `engineering`, `release`.

**Action families used across recipes:** `product`, `delivery`, `engineering`, `qa`,
`verification`, `review`, `release`, `support`, `summary`.

**Bundled recipes available now:** `explain-selected-work`, `review-acceptance-criteria`,
`create-qa-test-plan`, `summarize-project-risk`, `next-best-task`, `prioritize-pending-work`,
`focus-needs-my-action`, `show-only-assigned-to-me`, `shape-next-backlog-slice`,
`unblock-my-work`, `stakeholder-update`, `draft-status-update`,
`technical-implementation-plan`, `address-linked-pr-feedback`, `unblock-blocked-ticket`,
`re-scope-ticket-overrun`, `release-handoff-checklist`, `prepare-post-merge-closeout`,
`support-escalation-summary`, `tshirt-size-epic` (plus the recipe-authoring recipes).
