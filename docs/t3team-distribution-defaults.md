# Distribution setting defaults

Server settings this distribution flips on. Upstream keeps them off.

| Setting                     | Upstream | Here | Pointer                                                |
| --------------------------- | -------- | ---- | ------------------------------------------------------ |
| `autoResumeLimitedThreads`  | off      | on   | `packages/contracts/src/settings.ts`                   |
| `linkedEnvironmentsEnabled` | off      | on   | same; Labs toggle still turns it off (peer links beta) |

- Written sparsely: only an opt-out is persisted.
- Peer links: [remote.md](internals/remote.md) "Peer links".
- A link still needs a pairing code from the other environment.
