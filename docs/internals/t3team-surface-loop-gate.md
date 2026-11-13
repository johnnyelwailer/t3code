# Setup-surface render-loop gate

Every create, open and setup surface (add project, open existing, the
linked-repositories dialog, welcome setup, the Jira catalog, the inline
repository chips and their Retry) must have a `*.loop.test.tsx` that:

- asserts a `RENDER_CAP` (80) on the surface's render count
- uses live-shaped discovery or auth fakes, marked by the `LIVE_SHAPED_DISCOVERY`
  token: a new function identity every time the lower-boundary hook runs, and a
  new payload object every call
- does not fully mock `useGitHubRepositoryDiscovery`, `useGitHubAuthProbe` or
  `useLinkedRepositorySyncStatus` for the surface those hooks serve

The gate is `t3team-surface-loop-gate.mjs`. It runs as a second step on the
existing rerender-gate job (plain Node, no workspace install, no new CI job).

```bash
node t3team-surface-loop-gate.mjs
```
