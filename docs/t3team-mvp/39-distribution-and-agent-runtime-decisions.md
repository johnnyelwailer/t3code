# Distribution and agent-runtime decisions

This note captures three architecture questions for the public t3team core and the private Nexi distribution.

## 1. Private Nexi repository with t3code as a Git submodule

This is feasible and gives a very clear release binding:

```text
nexi-distribution/
  vendor/t3code/       # submodule, pinned to one public commit
  packs/nexplore-global/
  build/
```

The private repository can then say exactly which public core it ships. A release tag on the private repository records both the Nexi pack commit and the t3code submodule commit.

### Benefits

- Exact, reviewable core version binding.
- Reproducible distribution builds.
- Public core changes cannot silently enter the private product.
- Easy rollback: move the submodule pointer back to a known-good commit.

### Costs and operational rules

- A submodule is detached-HEAD by design; developers must update it intentionally.
- CI must explicitly run `git submodule update --init --recursive`.
- The private repository must not patch files inside the submodule. Public changes belong in the public fork; private behavior belongs in packs/overlays.
- Updating the submodule is a reviewable dependency change, not an incidental pull.
- Local tooling must work from both the superproject and the submodule.

### Recommendation

Use the submodule for release assembly if Nexi will build a distributable product from the private repository. Keep day-to-day public development in the public fork. Add a small release manifest containing the expected core commit, pack API version, and pack commits so CI can reject mismatches.

Do not use a submodule as a mechanism for private source changes. It is a version pin, not an extension system.

## 2. Atlassian as an optional open-source package

Atlassian should remain an open-source contribution, but not be loaded by the default shell.

Proposed shape:

```text
packages/integrations-atlassian/
  connector/
  auth/
  jira/
  confluence/
  cache/
```

The package exposes typed connector/provider definitions. The default public build does not activate it. A distribution or project pack opts in through its manifest and capabilities:

```json
{
  "contents": {
    "connectors": [{ "id": "atlassian", "path": "..." }]
  },
  "capabilities": ["connector:atlassian"]
}
```

The package must not add Atlassian assumptions to the generic shell. It should own OAuth/site selection, Jira/Confluence API access, normalization, cache policy, and connector-specific views. Core code should only consume the connector SPI.

This keeps Atlassian useful to the open-source ecosystem while allowing Nexi to ship it as a selected provider rather than a mandatory dependency.

## 3. Replace OpenCode as the internal Nexplore harness

OpenCode is useful as an existing integration, but it is too opinionated for the private Nexplore agent path. t3team already owns the product-level orchestration:

- child threads
- workflows and runbooks
- artifacts and persistence
- project context
- provider/model selection
- recovery and UI state

The internal harness should therefore be a thin agent runtime, not another product shell.

### Runtime boundary

Define a stable driver SPI in the pack API:

```ts
type AgentDriver = {
  readonly start: (input: AgentStartInput) => Promise<AgentSession>;
};

type AgentSession = {
  readonly events: AsyncIterable<AgentEvent>;
  readonly send: (input: AgentInput) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly snapshot: () => AgentSnapshot;
  readonly dispose: () => Promise<void>;
};
```

The host owns transport-independent concerns such as thread identity, persistence, workflow orchestration, permissions, and UI events. The driver owns only model interaction, tool calls, and agent-session events.

### Harness candidates

- **PI or a similarly minimal runtime:** preferred spike for Nexplore. It should be evaluated as a library/runtime, not adopted as a second application shell.
- **Raw OpenAI-compatible loop:** useful fallback and control experiment. It gives maximum ownership but requires implementing tool-call and event semantics ourselves.
- **OpenCode:** retain as an optional public adapter for compatibility, not as the required internal Nexplore runtime.

### Recommendation

Do not expose OpenCode concepts in the private pack API. Expose the neutral `AgentDriver`/`AgentSession` contract, then implement a private Nexplore adapter around PI (or the smallest viable alternative). Keep the existing OpenCode adapter behind a separate package so current public functionality remains available.

## Ordered next actions

1. Add a release manifest and optional submodule layout spike in `nexi-distribution`.
2. Extract Atlassian into an opt-in public package and add a disabled-by-default integration test.
3. Extend `@t3team/pack-api` with the neutral `AgentDriver` and `AgentSession` contracts.
4. Build a PI/raw-runtime spike against `chat.nexplore.dev` using the real model `qwen3.6-35b-a3b-q6-192k:nothink`.
5. Move the Nexplore provider lifecycle into the private pack only after the spike passes streaming, tool calls, cancellation, recovery, and snapshot tests.
6. Keep OpenCode support as an isolated adapter until the new runtime is production-ready.
