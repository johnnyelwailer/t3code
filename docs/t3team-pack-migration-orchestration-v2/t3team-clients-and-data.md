# 3.12 Client expectations and data carried over

Part of the [pack migration guide](../t3team-pack-migration-orchestration-v2.md). Applies to a pack
that ships a client, a web extension, scripts or automation calling the server.

## Connection and routes

- Speak orchestration protocol 2 (`?orchestrationProtocol=2` on `/ws`; otherwise HTTP 426).
- Every `/api/t3team/*` route needs an environment session, checked like upstream's raw routes
  (`authenticateRawRouteWithScope`): session cookie (same origin) or `Authorization: Bearer
<token>`; GET/HEAD need `orchestration:read`, other methods `orchestration:operate`; refusals
  are upstream's 401 `EnvironmentAuthInvalidError` / 403 `EnvironmentScopeRequiredError` bodies
  (`apps/server/src/t3team-routeAuth.ts`). Exempt: `/api/t3team/cloud-broker/*`, the Atlassian
  sign-in callbacks (`GET …/atlassian/oauth/begin/:state`, `POST …/oauth/complete`,
  `GET …/oauth/status/:state`) and `GET /api/t3team/atlassian/asset/content`. Fork routes no longer
  send `access-control-allow-origin: *`. Web code uses `primaryServerAuthInit()`
  (`apps/web/src/t3team/backend/t3team-t3BackendHttp.ts`).
- Fork side streams are gated by `ExecutionEnvironmentCapabilities.t3team`. Client atoms (all
  settle empty against servers without the capability):
  `@t3tools/client-runtime/state/thread-facts` (`createT3TeamThreadFactsAtoms`; pack facts under
  `facts.extensions["<pack>.<fact>"]`), `/state/thread-artifacts`
  (`createT3TeamThreadArtifactsAtoms`; sorted by `createdAt`, `id`), `/state/thread-stop-cascade`
  (`createT3TeamStopCascadeCommand`, `supportsT3TeamStopCascade`, `hasLiveSubagentChild`),
  `/state/message-framing` (`readT3TeamMessageExt`, `isHiddenT3TeamFramingMessage`). Gate further
  pack streams with `subscribeWhenSupported`
  (`packages/client-runtime/src/rpc/t3team-capabilityGatedSubscription.ts`).

## What the web and mobile clients render

The web client cannot load pack renderers (manifest `contents.artifactRenderers` is not read).

- **Artifacts:** only `message-ext` (merged into the message `messageId` names; a `null`
  `messageId` becomes its own `system` row at `createdAt`) and `widget` render as rows. Kinds
  starting `t3team.` with payload `{tone?, summary?, payload}` feed activity records (workflow step
  pips). `draft-mutation` feeds the draft review store. Every other kind is ignored: put pack
  cards on a `message-ext` artifact (attachments of kind `view`, `resource`, …) or a `widget`
  artifact (`apps/web/src/t3team/chat/t3team-artifactMessageExt.ts`, `t3team-timelineArtifacts.ts`).
- **Notes:** a `system_notice` whose turn item id starts `t3team:turn-item:` renders as a fork
  `system` row; any other `system_notice` renders as upstream's runtime-warning line
  (`apps/web/src/t3team/chat/t3team-recorderNote.ts`). Post notes through the recorder (3.7).
- **Framing:** web and mobile hide a user message whose ext says `visibleToUser: false`, and a
  `createdBy: "system"` message with no ext `author`. A system-authored message that names its
  author (workflow prompts) is shown.
- **Inter-agent messages** render as upstream's "Sent by another agent" user message
  (`createdBy: "agent"` + `senderThreadId`) or the digest `notification` row; `actor` rows and
  `author.kind: "actor"` no longer render. The "→ Sent message to …" label keys on
  `t3_thread_send` calls (`apps/web/src/t3team/chat/t3team-actorOutbound.ts`).
- **Activity word:** on the open thread it is derived from the active run's in-flight turn item:
  reasoning → thinking, streaming assistant message → writing, other running item → working,
  pending approval or question → waiting, quiet live run → thinking
  (`apps/web/src/t3team/t3team-activityStateDerive.ts`). Listed rows (sidebar, sub-run tree) show
  the `activityLabel` fact, gated by `t3teamActivityLabelsEnabled`, else "Working";
  `ProjectThread.activityState` is gone.
- **Status words:** "Monitoring" and declared "Waiting" collapsed into one "Waiting"
  (`ProjectThread.waitingOnChildren`, from subagent `pendingBackgroundTasks` or live lineage
  children); `ProjectThread.waitingDeclared` and `.providerKind` are gone. Workflow liveness comes
  from the facts `workflowRunStatus` / `sleepingUntil`
  (`apps/web/src/t3team/t3team-workflowRunLiveness.ts`).
- **Rosters** hide children with fact `retention: "ephemeral"` once they stop running; each
  delegated child appears once, in the thread details Lineage section.
- **Stop incl. sub-runs** is offered only with `capabilities.t3team.stopCascade` and a live
  `subagent` child, with a fresh `commandId` per click.
- **Composer:** `sendT3TeamThreadTurn` queues behind an active run instead of rejecting.
  `ChatViewT3TeamExtensionProps.queuedExtensions` → `composerBannerLeading?: ReactNode`
  (`apps/web/src/t3team/t3team-chatViewExtensions.ts`).
- **Memory-pressure banner** reads the fact `resourcePressurePaused`; `resource-pressure.paused` /
  `.resumed` activities are no longer written or read.

## Data carried over at first start

One-shot ledger steps (`t3team_v2_cutover`) and the upstream V1 importer bring fork data across;
see also `docs/user/thread-migration.md`.

- `v1-lineage` (`apps/server/src/orchestration-v2/legacy/t3team-legacyLineageCutover.ts`): handoff
  children → `subagent` lineage, fork-source notes → `fork`, handoff `ticketId` →
  `t3team_child_thread_metadata`, `retention = 'ephemeral'` and `environment_json` → facts. Any other
  field a pack stored in handoff payloads is not carried: re-derive it from lineage or store it in
  pack facts (`extensions`).
- Imported messages carry their fork ext on the V2 message context, field by field
  (`readT3TeamMessageExtContext`). V1 `actor` rows become user messages with `createdBy: "agent"`
  and `senderThreadId`; V1 `system` notes with text become run-less `system` messages. V1 messages
  marked `visibleToUser = false` are not imported
  (`legacy/t3team-legacyMessageMapping.ts`, `t3team-legacyMessageColumns.ts`).
- `v1-rich-messages` (`legacy/t3team-legacyRichMessageCutover.ts`): system-row attachments →
  `widget:<widgetId>` / `message-ext:<messageId>` artifacts, draft proposals → `draft-mutation`
  artifacts keyed by draft id, all at the V1 row's time; V1 deliveries pending at shutdown →
  `pending` mailbox entries with the recipient held until the user writes there. A pack that
  re-posted V1 rich rows itself should stop.
- Not carried: open silence watches, in-memory child waits, the hidden framing of V1 messages.
