# Epic 12: Profiles And Skill Packs

## Purpose

`t3work` should not be positioned as a QA-only product. QA is the first useful bundle,
but the product is a project-based agent workspace for many kinds of work.

Profiles and skill packs make that explicit.

Profiles are configuration, not a hardcoded product enum.

`t3work` may ship bundled starter profiles, but users and projects should be able to add,
clone, edit, and replace profiles freely. Runtime behavior must never depend on checks
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

A project can enable multiple skill packs. A user can select one default profile for how
they want the agent to communicate.

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

- selected profile
- enabled skill packs
- top recipes that will appear first
- mutation safety policy

## UI Requirements

Profile selection should be a normal setup step, not hidden in settings.

Use existing T3 primitives:

- cards for profile choices
- badges for skill pack categories
- select/menu for compact profile switching
- settings rows for later edits

Users should also be able to clone a starter profile into a custom profile and edit its
preferences without leaving the normal setup/settings flow.

Project overview should show enabled skill packs as quiet badges near the project source
badges.

GitHub PR and review surfaces should also expose the active profile as a lightweight mode
switch. Switching profiles should immediately rerank actions, adjust explanation density,
and change guided-vs-expert defaults without forcing the user to reopen chat.

That mode switch should operate on the selected profile configuration's preferences. It
must not special-case named starter profiles.
