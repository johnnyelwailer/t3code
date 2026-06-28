# Epic 13: Resource References

## Purpose

Jira issues and other external entities should be referenceable in the composer just like
files.

T3 Code already uses:

- `@` for file and folder mentions
- `$` for skills
- `/` for commands

`t3work` should reuse this model. External resources should use `@`, not introduce a
new primary symbol.

## Principle

Use one mental model:

```text
@ means attach or reference context
$ means invoke a skill
/ means run a command
```

That means:

- `@src/App.tsx` references a file
- `@jira:ABC-123` references a Jira issue
- `@confluence:SPACE/page-title` can later reference a Confluence page
- `$qa.create-test-plan` invokes a skill
- `/model` opens a command

## Existing T3 Baseline

Current T3 composer behavior:

- `@query` triggers workspace file/folder search.
- `$query` triggers skill search.
- `/query` triggers command search.
- Composer selected mentions become inline chips/segments.

`t3work` should extend this instead of creating a separate resource picker model.

Relevant existing files:

- `apps/web/src/composer-logic.ts`
- `apps/web/src/composer-editor-mentions.ts`
- `apps/web/src/components/chat/ComposerCommandMenu.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`

## Resource Reference Syntax

### Canonical

Use typed `@provider:id` references.

Examples:

```text
@jira:ABC-123
@jira:PROJ-42
@confluence:ENG/runbook-release
@github:owner/repo#123
@linear:TEAM-123
```

### Display Labels

The composer can render richer labels while preserving canonical text internally.

Example:

```text
@jira:ABC-123
```

renders as a chip:

```text
ABC-123 · Login fails on Safari
```

### Project-Scoped Shorthand

When the active project has a default Jira source, allow shorthand issue keys:

```text
@ABC-123
```

This should resolve to:

```text
@jira:ABC-123
```

Only enable shorthand when it is unambiguous.

## Inline Auto-Detection And Attach

The composer should also recognize resource references typed as plain text, not only
explicit `@provider:id` references.

Examples:

```text
Can you compare ABC-123 with ABC-456?
```

```text
Check #13 before changing the auth flow.
```

Detected references render as inline link-style tokens and enqueue the same pre-submit
context attachment used by "Add to chat". They are not a separate attachment path.

This means:

- the attachment chip appears before submit
- the user can remove it with the same `×` affordance
- send-time context sync uses the existing attachment pipeline
- duplicate attachment prevention uses the existing dedupe rules

### Secure project scope

Auto-detected references must always resolve inside the active `t3work` project scope.

Rules:

- Never resolve a detected key against global provider state.
- Never attach an item from another project unless that item is already linked into the
  active project's trusted resource graph.
- The resolver input must include the active project ID and active surface context.
- A plain key is only linkified when exactly one active-project resource matches.
- Ambiguous or out-of-scope text remains plain text.
- Provider adapters may return candidates only through project-scoped query APIs.

Provider does not change this rule. Jira, GitHub, Linear, and future custom providers all
use the same scoped resolver contract.

Examples:

```text
ABC-123
```

Valid only if `ABC-123` exists in the current project's scoped work-item index.

```text
#13
```

Valid only if the active project has exactly one scoped GitHub repository where issue or
pull request `13` is known or can be queried through the project-scoped GitHub adapter.

```text
other-org/other-repo#13
```

Valid only if that repository is linked to the active project. Otherwise it stays plain
text.

### Detection timing

Auto-attach happens after a completed token delimiter, not while the user is still typing.

Delimiters:

- whitespace
- newline
- punctuation that cannot be part of the provider reference
- composer blur
- submit

Example:

```text
ABC-12
```

No auto-attach yet.

```text
ABC-123 
```

Resolve and attach if project-scoped match is unique.

Autocomplete can still appear while the token is incomplete. Selecting a result inserts
the completed canonical display token and attaches immediately.

### Manual removal suppression

Removing an auto-attached chip suppresses re-attachment for that exact token occurrence
while the text remains unchanged.

Example:

1. User types `ABC-123 `.
2. Composer auto-attaches `ABC-123`.
3. User removes the chip.
4. Composer does not re-add it while that same `ABC-123` token remains in the draft.
5. If the user deletes the token and types `ABC-123 ` again, auto-attach may run again.

Suppression is draft-local UI state, not persisted project state.

### GitHub hash semantics

GitHub's common shorthand is:

```text
#13
owner/repo#13
```

On GitHub, `#13` means issue or pull request number `13` in the current repository
context. `owner/repo#13` means issue or pull request `13` in that named repository.

`t3work` should mirror that mental model, but with stricter project scoping:

- `#13` resolves only when the active project surface has one clear current repository.
- `owner/repo#13` resolves only when `owner/repo` is linked to the active project.
- If both an issue and pull request with the same number could be returned by a provider
  adapter, the menu should show both typed candidates; plain-text auto-attach requires one
  unique match.
- Display labels should preserve provider kind, for example `PR #13` or `Issue #13`.

### Autocomplete behavior

Reference autocomplete is a contributor to the existing composer menu, not a new popout.

Triggers:

- active project work-item prefix, such as `ABC-`
- GitHub hash `#`
- explicit canonical `@provider:` syntax from this epic

Examples:

```text
ABC-
```

shows active-project work items whose display ID starts with `ABC-`.

```text
#1
```

shows active-project GitHub issues and pull requests matching number/title `1`.

Selecting a candidate:

1. replaces the typed range with the provider's preferred display token
2. records the canonical `ResourceRef`
3. enqueues the same context attachment as Add to chat
4. keeps the visible chip removable before submit

### Resolver contract

The composer should call a provider-agnostic resolver shape:

```ts
type ComposerResourceResolveInput = {
  projectId: string;
  surface: string;
  token: string;
  trigger: "plain" | "autocomplete" | "canonical";
};

type ComposerResourceCandidate = {
  ref: ResourceRef;
  displayToken: string;
  label: string;
  description?: string;
  attachable: boolean;
};
```

For MVP, candidates can be served from the current project backlog, current ticket graph,
and linked GitHub activity cache before adding live provider queries.

## Picker Behavior

Typing `@` opens one combined reference menu.

Groups:

- Files
- Jira issues
- Project artifacts
- Project memory
- Later: Confluence, GitHub, Linear, local documents

Ranking should prefer:

1. resources from the active project
2. recently opened resources
3. exact key matches
4. title matches
5. files, if the query looks path-like

Examples:

```text
@ABC
```

should show:

- Jira issue `ABC-123`
- Jira issue `ABC-456`
- matching local files only if relevant

```text
@src/
```

should prioritize files.

```text
@jira:
```

should show Jira issues only.

## Composer Item Model

Extend the existing command menu item concept with a resource item.

```ts
type ComposerReferenceItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: "file" | "directory";
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "resource";
      ref: ResourceRef;
      label: string;
      description: string;
      icon: ResourceIcon;
      sourceLabel: string;
    };
```

Resource rows should use the existing `ComposerCommandMenu` density and behavior.

## Resource Ref Model

Use the shared `t3work` resource model.

```ts
type ResourceRef = {
  provider: string; // open connector slug — e.g. "atlassian", "github", "linear", "local"
  kind: string;
  id: string;
  displayId?: string;
  title: string;
  url?: string;
  projectId?: string;
};
```

`provider` is an open slug, not a closed union — a user-authored connector
([Epic 04](./04-integration-platform.md)) must be referenceable without editing this type.

For Jira:

```ts
const ref = {
  provider: "atlassian",
  kind: "jira-issue",
  id: "cloud:<cloudId>:issue:<issueId>",
  displayId: "ABC-123",
  title: "Login fails on Safari",
  url: "https://example.atlassian.net/browse/ABC-123",
  projectId: "abc",
};
```

## Cross-Provider Links (Embedded References)

Everything above covers references the **user types** into the composer. The platform also
extracts references that are **already embedded inside fetched resource data** — and
promotes them to first-class, openable resources.

This is what makes "the Confluence pages linked from this Jira ticket" real: a Confluence
URL in a ticket description, a Jira remote link, or an Atlassian smart-link is not left as
opaque text — it is normalized into a typed relation that resolves across connectors.

### Relation model

```ts
type ResourceRelation = {
  from: ResourceRef; // e.g. the Jira issue
  to: ResourceRef; // e.g. @confluence:ENG/runbook-release
  kind: string; // "links" | "mentions" | "remote-link" | "child-of" | ...
  source: "body" | "remote-link" | "smart-link" | "field";
};
```

- **Extraction** — a connector's `extractRelations`
  ([Epic 04](./04-integration-platform.md)) parses a fetched snapshot (issue body, remote
  links, page body) and emits relations. Extraction runs at sync/fetch time, not at render
  time.
- **Cross-Source resolution** — `to` may target a different connector. A relation to
  `@confluence:SPACE/page` resolves through Atlassian; one to `@github:owner/repo#1`
  through a GitHub connector. The graph spans Sources.
- **Rendering** — relations render as resource chips (open inline) and populate the
  "linked resources" sections on Resource Detail and Page Detail
  ([Epic 03](./03-project-browser.md), [Epic 26](./26-knowledge-workbench.md)).
- **Maintenance signal** — an unresolved `to` is a stale-link finding for knowledge
  maintenance ([Epic 26](./26-knowledge-workbench.md)).

The cross-provider graph is the connective tissue of the [vision](./00-vision.md); the
[Knowledge Workbench](./26-knowledge-workbench.md) is its primary consumer.

## Thread Attachment Behavior

When a resource reference is sent in a message:

1. Resolve the reference.
2. Fetch or read the latest cached snapshot.
3. Attach a structured resource snapshot to the thread turn.
4. Preserve the inline reference in the visible message.
5. Save the snapshot under the managed workspace cache.

The agent should receive both:

- user-visible text containing the reference
- structured resource context with normalized fields and source URL

For context-bound chat, this file-backed context should be the default way to give the
agent broad project, work-item, backlog, and GitHub activity data. Dedicated read tools
should focus on freshness, narrow live queries, view state, and small option lists rather
than duplicating attached context files.

## Visual Treatment

Use the same inline chip behavior as file mentions.

Resource chips should show:

- product/source icon, such as Jira
- display ID, such as `ABC-123`
- short title when space allows
- tooltip with source, status, and URL

For dense composer rendering:

```text
ABC-123
```

For expanded/detail rendering:

```text
ABC-123 · Login fails on Safari
```

## Resource Search Tooling

Add a generic resource search path under integrations.

```ts
type ResourceSearchInput = {
  projectId: string;
  query: string;
  providers?: string[];
  kinds?: string[];
  limit: number;
};
```

Initial Jira implementation:

- exact issue key lookup
- JQL text search fallback
- recently cached issues
- current project issue list

## Ambiguity Rules

If `@ABC-123` could refer to more than one source, show the picker instead of silently
resolving.

If a resource is inaccessible:

- keep the textual reference
- show an unresolved chip state
- offer reconnect/refresh when possible

If a resource was deleted:

- show cached snapshot if available
- mark it as stale

## MVP Scope

Implement first:

- `@jira:KEY-123` canonical references
- active-project shorthand `@KEY-123`
- Jira issue search in composer menu
- Jira issue chip rendering
- structured Jira issue attachment on send
- stale/unresolved visual state

Next (with the [Knowledge Workbench](./26-knowledge-workbench.md), Epic 26):

- Confluence references (`@confluence:SPACE/page`)
- embedded cross-provider link extraction (`ResourceRelation`) and inline resolution

Defer:

- GitHub PR/issue references
- cross-project references
- bulk references
- natural-language fuzzy resource linking

## Browser Validation

The agent must validate resource references in a browser by clicking through:

1. Open a Jira-backed `t3work` project.
2. Focus composer.
3. Type `@`.
4. Verify files and Jira issues appear in the menu.
5. Type a Jira issue key prefix.
6. Select a Jira issue.
7. Verify the inline chip renders.
8. Send the message.
9. Verify the thread includes structured issue context.
10. Open the same thread again and verify the chip/artifact still resolves from cache.
