# Epic 04: Integration Platform

## Purpose

The integration platform allows projects to be created from external systems and lets
skills read external context through a stable tool surface.

Atlassian is the first implementation, not the abstraction.

## Core Concepts

### Integration Account

An authenticated account or site connection.

```ts
type IntegrationAccount = {
  id: string;
  provider: string;
  label: string;
  accountUrl?: string;
};
```

### External Project

A project-like object exposed by an integration.

```ts
type ExternalProject = {
  id: string;
  provider: string;
  title: string;
  key?: string;
  url?: string;
  description?: string;
  raw?: unknown;
};
```

### Resource Ref

A stable pointer to an external object.

```ts
type ResourceRef = {
  provider: string;
  kind: string;
  id: string;
  displayId?: string;
  title: string;
  url?: string;
  projectId?: string;
};
```

### Resource Snapshot

A normalized, cached copy of an external resource.

```ts
type ResourceSnapshot = {
  ref: ResourceRef;
  fetchedAt: string;
  summary?: string;
  fields: Record<string, unknown>;
  text?: string;
  raw?: unknown;
};
```

## Provider Interface

Every provider should support discovery, reading, search, action discovery, and
reviewable mutation flows.

```ts
type IntegrationProvider = {
  id: string;
  kind: string;
  listAccounts(): Promise<IntegrationAccount[]>;
  listProjects(account: IntegrationAccountRef): Promise<ExternalProject[]>;
  listResources(input: ListResourcesInput): Promise<ResourcePage>;
  getResource(ref: ResourceRef): Promise<ResourceSnapshot>;
  search(input: IntegrationSearchInput): Promise<ResourceSearchResult[]>;
  getAvailableActions(ref: ResourceRef): Promise<IntegrationAction[]>;
  prepareMutation(input: PrepareMutationInput): Promise<PreparedMutation>;
  commitMutation(input: CommitMutationInput): Promise<MutationResult>;
};
```

## Mutation Design

All external writes should be two-step:

1. `prepareMutation` returns a reviewable mutation model.
2. `commitMutation` executes only after explicit approval.

This lets skills draft useful work while keeping user consent clear.

## Caching

The platform should cache:

- project lists
- resource lists
- resource snapshots
- search results where useful
- mutation audit records

The cache layer has two complementary storage forms:

1. **Local SQL cache** — the primary store for queryable provider data, in the existing
   `effect/sql` persistence layer
   ([apps/server/src/persistence/Layers/Sqlite.ts](../../apps/server/src/persistence/Layers/Sqlite.ts)).
   Provider sync writes into namespaced tables; recipes, Views, and workflow steps consume
   this through the `Queryable<T>` contract defined in
   [Epic 16 — Context: Reactive Queryable Surface](./16-action-recipes.md#context-reactive-queryable-surface).
   Mutations flow through the existing orchestration-events / projection pipeline, which
   drives reactive invalidation for client consumers.
2. **Managed workspace files** — raw provider payloads and large blob assets live under
   `<managed-project>/sources/<provider>/` and `<managed-project>/cache/`. These are the
   on-disk record (useful for audit, agent inspection, and re-deriving the SQL projection),
   not the primary query substrate.

The t3work-Atlassian backlog cache
([apps/server/src/t3work-atlassian-backlog-cacheReadWrite.ts](../../apps/server/src/t3work-atlassian-backlog-cacheReadWrite.ts))
is the existing template for new providers.

## Future Providers

The same model should fit:

- Linear teams/issues
- GitHub repositories/issues/pull requests
- Azure DevOps projects/work items
- Notion databases/pages
- Zendesk groups/tickets
- local file collections
