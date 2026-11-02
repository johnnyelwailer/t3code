# `t3_environment_links` and cloud sessions (INTERIM)

- Also lists Nexi cloud sessions in `cloudSessions`
- Only with flag `DELEGATE_CLOUD` on; off, the result is unchanged
- Behind the Linked environments beta: off, the tool is hidden
- Rows: `sessionId`, `phase`, `machineLabel`, `repository`, `endsAt`, `kind: "cloud"`
- Ended, expired and non-broker sessions are not listed
- Broker failure: links stay, `cloudSessions.unavailable` says why
- Reach one with `delegate_task` `extensions.cloudSession: <sessionId>`
- Code: `apps/server/src/t3team-environmentLinksCloud.ts`, a layer over `PeerForwarding`
- Plan: cloud sessions become peer-linked environments (hive/nx-nexi#936)
