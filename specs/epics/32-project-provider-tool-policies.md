# Epic 32: Project Provider And Tool Policies

## Purpose

Add a first-class policy layer that decides which agent providers may operate on which
projects and which tool groups they may access.

The policy layer answers questions like:

```text
Can Claude Code run inside project ABC?
Can Codex read Jira context for project ABC?
Can any provider call the jira.write tool group without user approval?
```

## Problem

Provider choice is not only a model preference. It is a trust and data-routing decision.
Some teams may allow a provider for source code but not for Jira, Confluence, security
tickets, customer data, or specific mutation tools.

Without explicit policy, a project can accidentally leak sensitive work context to a
provider that the team did not approve for that project or tool group.

## Policy Scope

Policies should compose across three levels:

1. **Global default** — the app or organization baseline.
2. **Project policy** — allow or deny providers for one `t3work` project.
3. **Tool-group policy** — allow, deny, or require approval for provider access to a tool
   group.

Project policy example:

```text
Project MOBILE:
- Codex allowed
- Claude Code denied
- OpenCode allowed for local-only work
```

Tool-group policy example:

```text
Tool group jira.read:
- Codex allowed
- Claude Code denied

Tool group jira.write:
- Codex requires user approval
- Claude Code denied
```

## Synced Context Contamination

Tool calls are straightforward to gate because every call crosses the broker. Already
synced context is harder: once Jira, Confluence, or another connector has written files
into `.t3work/context/...`, a provider running in the same project workspace may be able to
read those files through normal filesystem access.

That means connector policy must affect provider session eligibility, not only tool
injection.

Rule:

```text
If a project workspace contains synced context from connector C, and provider P is not
allowed to access connector C, provider P is denied for that project workspace unless the
session runs in a context-isolated sandbox.
```

Example:

```text
Project MOBILE has synced Jira context under .t3work/context/jira/...
Policy says Claude Code cannot access Jira.
Result: Claude Code cannot start in that project workspace.
```

This is stricter than denying `jira.read` tools. It prevents bypass through local synced
files.

Possible future isolation modes:

- **No synced context** — start the provider in a clean workspace view that excludes
  `.t3work/context/<blocked-connector>`.
- **Redacted context mirror** — materialize a temporary workspace with only policy-approved
  context files.
- **Filesystem sandbox** — run the provider with path-level deny rules for blocked connector
  context.

MVP posture:

```text
No reliable isolation, no provider start.
```

Isolation can be added later, but it must be proven at the filesystem boundary. Prompt
instructions and hidden tool lists are not enough.

## Enforcement Model

Policy enforcement must happen in the host backend, not inside provider prompts.

Required gates:

- before starting a provider session for a project
- before resolving the provider's filesystem workspace or sandbox
- before attaching project or work-item context to a provider turn
- before injecting any tool group into a provider
- before executing any brokered tool call
- before workflow launch when `meta.capabilities` includes restricted tool groups

The provider adapter may format policy results for native transport, but it must not be the
source of authority.

## Canonical Decision

Every gate should reduce to a small, auditable decision:

```ts
type T3workPolicyDecision =
  | { status: "allow"; reason: string }
  | { status: "require_approval"; reason: string; approvalKind: string }
  | { status: "deny"; reason: string };
```

Example inputs:

```ts
type T3workPolicyRequest = {
  actorId: string;
  projectId: string;
  providerId: string; // e.g. "codex", "claude-code"
  action:
    | "start_session"
    | "resolve_workspace"
    | "attach_context"
    | "inject_tool_group"
    | "execute_tool";
  toolGroupId?: string; // e.g. "jira.read", "jira.write", "github.pr.write"
  connectorId?: string; // e.g. "atlassian", "github"
  resourceKinds?: ReadonlyArray<string>; // e.g. ["jira.issue", "confluence.page"]
  syncedConnectorIds?: ReadonlyArray<string>;
};
```

## User Experience

Project setup should show provider availability before the user starts work.

Examples:

```text
Claude Code is blocked for this project.
Reason: Jira context is already synced in this workspace and Claude Code is not approved
for Atlassian.
```

```text
Codex can read Jira content, but posting Jira comments requires approval.
```

When a recipe or workflow is unavailable because of policy, the launcher should explain the
smallest blocking rule instead of hiding the recipe silently.

## Relationship To Existing Epics

- [Epic 14: Native Provider Tool Injection](./14-native-provider-tool-injection.md) already
  requires host-side scope validation. This epic adds provider and tool-group policy to that
  same gate.
- [Epic 21: Context Tool Catalog](./21-context-tool-catalog.md) defines tool classes and
  groups. Policies attach to those groups.
- [Epic 25: Workflow Engine](./25-workflow-engine.md) defines `meta.capabilities`; workflow
  launch must check those capabilities against policy before execution.
- [Epic 23: Project Setup Preflight UI](./23-project-setup-preflight-ui.md) is the natural
  place to display project-specific provider approval state.

## MVP Slice

1. Add a policy contract for project/provider/tool-group decisions.
2. Store project-local provider allow/deny rules.
3. Store tool-group rules for at least `jira.read` and `jira.write`.
4. Track which connector context has been synced into the project workspace.
5. Block provider session start when the provider is denied for any synced connector context
   and no isolation mode is active.
6. Filter injected tool groups by policy.
7. Return visible denial reasons to setup, launcher, and thread UI.

## Non-Goals

- Do not implement full enterprise RBAC in the MVP.
- Do not rely on prompt instructions as policy enforcement.
- Do not let provider-specific adapters bypass the shared policy gate.
- Do not silently downgrade context or tool access without telling the user why.
- Do not claim connector isolation while blocked connector context remains readable from the
  provider's workspace.

## Open Questions

- Should project owners be able to edit policy locally, or should organization policy be
  read-only in managed deployments?
- Should policy distinguish read-only project metadata from full work-item content?
- Should approval be per run, per provider session, per tool group, or per individual tool
  call?
- Which providers can be launched with enforceable filesystem path restrictions?
- Should synced context taint clear automatically when connector files are removed, or should
  it remain until the project workspace is rebuilt?
- How should policies be exported with project recipes without leaking organization-specific
  rules?
