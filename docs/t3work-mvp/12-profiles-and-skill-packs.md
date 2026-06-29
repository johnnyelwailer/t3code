# Epic 12: Profiles And Skill Packs

## Purpose

`t3work` should not be positioned as a QA-only product. QA is the first useful bundle,
but the product is a project-based agent workspace for many kinds of work.

Profiles and skill packs make that explicit.

Profiles are configuration, not a hardcoded product enum.

`t3work` may ship bundled starter profiles as seed configuration, but profiles themselves
are fully configuration-based. Users and projects should be able to add, clone, edit, and
replace profiles freely without code changes. Runtime behavior must never depend on checks
like `profile.id === "engineering-copilot"` or `profile.title === "QA Assistant"`.
All ranking, visibility, and presentation logic should derive from the profile's lower-
level preference fields.

## Concepts

### Profile

A profile controls how the assistant communicates and what kind of output it prefers.

Bundled starter examples:

- QA Assistant
- Product Partner
- Support Triage
- Delivery Coordinator
- Engineering Copilot

Profiles affect:

- tone
- amount of technical detail
- level of guidance vs self-serve exploration
- preferred artifact types
- default recipe ranking
- default action family ranking
- mutation safety posture
- follow-up suggestions
- surface defaults such as summary-first vs diff-first emphasis
- **sidecar section composition** — which
  [sidecar sections](./19-workspace-miniapps.md#sidecar-sections) are visible by default,
  in what order, and which are collapsed; the profile sets the starting point (e.g., a
  QA profile leads with Open Bugs + QA Quick Starts; an engineering profile leads with
  Open Pull Requests). Profile defaults are the second layer in the override stack
  `bundled defaults → profile defaults → project config → user overrides`; the user can
  override per workspace via the context-menu hide / pin / reorder actions
  ([Epic 19 — Context menus](./19-workspace-miniapps.md#context-menus))

### Skill Pack

A skill pack is a bundle of recipes (authored as `recipe.ts` plugin modules), prompt
blocks, artifact templates, and tool-group permissions for a type of work. A skill pack's
recipes are bundled-source recipes — the same recipe model as project-local recipes, just
shipped with the app (see [Epic 16](./16-action-recipes.md)).

Examples:

- QA
- Product
- Support
- Delivery
- Engineering
- Release

A project can enable multiple skill packs. A project can also select multiple profiles
when a user plays more than one role in that project. One selected profile is always the
primary profile; it controls communication style and priority defaults. Additional
selected profiles contribute role coverage, recipe affinity, skill-pack suggestions,
artifact preferences, and surface composition.

Example:

```json
{
  "primaryProfileId": "product-partner",
  "profileIds": ["product-partner", "engineering-copilot"]
}
```

This means the assistant should speak primarily like a product partner, while still
surfacing engineering recipes, artifacts, and project views.

### Profile Set

The runtime should resolve a selected profile set into one effective profile at the
configuration boundary, so downstream recipe ranking and surface code can continue to
consume a single `T3WorkProfile`-shaped object.

Profile-set rules:

- `primaryProfileId` must be one of `profileIds`.
- If only one profile is selected, that profile is both selected and primary.
- If legacy config only has `profileId`, treat it as `{ primaryProfileId: profileId,
profileIds: [profileId] }`.
- Communication style comes from the primary profile unless a later explicit user setting
  overrides it.
- Scalar priority fields that affect wording or density come from the primary profile.
- Arrays such as `preferredArtifactKinds`, `defaultActionFamilies`, and
  `recommendedSkillPackIds` are merged by stable union, preserving selected-profile order
  and de-duplicating entries.
- `defaultRecipeWeights` are merged with primary profile weights taking precedence on
  conflicts. Secondary profile weights may still introduce recipes absent from the
  primary profile.
- `sidecarSections` start from the primary profile's order and append missing sections
  from secondary profiles.
- `hideImplementationComplexity` should follow the primary profile for communication, but
  capability and recipe visibility should not be hidden solely because the primary profile
  is non-technical.

The effective profile may use a synthetic id such as
`profile-set:product-partner+engineering-copilot`, but that id is generated and not a new
persisted custom profile. Persist selected profile ids and the primary id instead. Only
persist a generated custom profile when the user explicitly edits and saves the merged
configuration as its own profile.

## Package

Skill packs should live in:

```text
packages/t3work-skill-packs
```

This package owns bundled definitions, not runtime execution.

It should contain starter presets and starter skill packs, not the only legal profile
definitions in the system.

Suggested layout:

```text
packages/t3work-skill-packs/src/
  profiles/
    qaAssistant.ts
    productPartner.ts
    supportTriage.ts
    deliveryCoordinator.ts
    verificationGuide.ts
    engineeringCopilot.ts
  packs/
    qa.ts
    product.ts
    support.ts
    delivery.ts
    engineering.ts
    release.ts
  promptBlocks/
  artifactTemplates/
```

## Profile Model

```ts
type T3WorkProfile = {
  id: string;
  title: string;
  description: string;
  tags?: string[];
  communicationStyle: {
    technicalDepth: "low" | "medium" | "high";
    brevity: "short" | "balanced" | "detailed";
    guidanceStyle: "guided" | "balanced" | "expert";
    defaultLanguage?: string;
  };
  surfaceDefaults?: {
    detailDensity: "guided" | "balanced" | "expert";
    activityOrder?: "newest-first" | "oldest-first";
    collapseLowSignalEvents?: boolean;
  };
  preferredArtifactKinds: string[];
  defaultActionFamilies?: string[];
  defaultRecipeWeights: Record<string, number>;
};
```

Project setup stores profile selection separately from profile definitions:

```ts
type T3WorkProjectProfileSelection = {
  primaryProfileId: string;
  profileIds: string[];
};
```

Interpretation rules:

- `id` is a stable config identifier, not a behavior category.
- `title` is presentation only.
- `tags` are for browsing and admin organization, not primary runtime branching.
- UI and recipe logic should use `communicationStyle`, `surfaceDefaults`,
  `preferredArtifactKinds`, `defaultActionFamilies`, and `defaultRecipeWeights`.
- New preference fields may be added over time; consumers should ignore unknown fields
  safely.

## Skill Pack Model

```ts
type T3WorkSkillPack = {
  id: string;
  title: string;
  description: string;
  defaultProfileId?: string;
  recipeIds: string[];
  actionRecipeIds?: string[];
  promptBlockIds: string[];
  artifactTemplateIds: string[];
  allowedToolGroups: string[];
};
```

## Bundled Starter Profiles

### QA Assistant

For testers and QA-focused project work.

Defaults:

- low-to-medium technical depth
- short explanations
- test matrices
- risk lists
- clear reproduction steps
- explicit open questions

### Product Partner

For PMs, analysts, and product-adjacent users.

Defaults:

- low technical depth
- stakeholder summaries
- scope/risk framing
- requirement clarification
- decision notes

### Support Triage

For support and customer-facing investigation.

Defaults:

- customer-readable language
- escalation summaries
- reproduction request drafts
- severity and impact framing

### Delivery Coordinator

For release, planning, and coordination work.

Defaults:

- concise status
- blockers
- dependencies
- release checklists
- standup summaries

### Verification Guide

For test engineers, release engineers, and reliability-focused reviewers.

Defaults:

- low-to-medium technical depth
- guided summaries before raw implementation detail
- blockers, checks, and deployment status first
- verification checklists
- explicit next steps and ownership

### Engineering Copilot

For users who want more technical detail.

Defaults:

- higher technical depth
- expert guidance style
- implementation plans
- codebase references when available
- testing and verification steps
- diff-first review defaults

## Initial Skill Packs

### QA Pack

Recipes:

- Explain ticket simply
- Review acceptance criteria
- Create QA test plan
- Create bug reproduction guide
- Draft Jira comment

### Product Pack

Recipes:

- Summarize requirement
- Find ambiguity
- Draft stakeholder update
- Compare ticket to prior decisions
- Create open question list

### Support Pack

Recipes:

- Summarize customer issue
- Draft reproduction request
- Create escalation summary
- Map issue to known risks

### Delivery Pack

Recipes:

- Summarize project risk
- Create release checklist
- Draft standup update
- Identify blocked work

### Engineering Pack

Recipes:

- Draft implementation plan
- Identify likely repo areas
- Convert ticket to technical checklist
- Draft verification plan

### Release Pack

Recipes:

- Explain what changed in this PR
- Draft PR body from team template
- Show deployment and environment status
- Summarize rollout blockers
- Draft release note or handoff

## Project Creation Defaults

When creating from Jira:

- show recommended skill packs based on project type and issue data
- default packs based on project signals plus profile preference fields, not on profile id
  or title
- allow Product, Support, Delivery, Engineering, and Release packs to be enabled too
- never imply Jira projects are only for QA work

Example recommendation inputs:

- `communicationStyle.guidanceStyle`
- `communicationStyle.technicalDepth`
- `preferredArtifactKinds`
- `defaultActionFamilies`
- provider/project metadata such as Jira project type and issue patterns

Confirm screen should show:

- selected profiles
- primary profile
- enabled skill packs
- top recipes that will appear first
- mutation safety policy

## UI Requirements

Profile selection should be a normal setup step, not hidden in settings.

Use existing T3 primitives:

- multi-select cards for profile choices
- badges for skill pack categories
- select/menu for compact profile switching
- settings rows for later edits

Project setup should keep the flow simple:

1. Let the user select one or more profiles from the normal profile card grid.
2. If exactly one profile is selected, continue with that profile as primary.
3. If multiple profiles are selected, show a short review step listing the selected
   profiles, with remove controls and a primary-profile choice.
4. The primary choice should be explicit but lightweight, for example radio buttons inside
   the selected-profile review list.

The second step exists only for multi-select. Do not force all users through a heavier
profile composition screen.

Users should also be able to clone a starter profile into a custom profile and edit its
preferences without leaving the normal setup/settings flow.

Project overview should show enabled skill packs as quiet badges near the project source
badges.

GitHub PR and review surfaces should also expose the active primary profile as a
lightweight mode switch. Switching the primary profile should immediately rerank actions,
adjust explanation density, and change guided-vs-expert defaults without forcing the user
to reopen chat. Secondary selected profiles should remain available as project role
coverage unless the user removes them from project settings.

That mode switch should operate on the selected profile configuration's preferences. It
must not special-case named starter profiles.
