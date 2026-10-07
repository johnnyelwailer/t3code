import type { CloudSession } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import type { CloudSessionMachine } from "./t3team-CloudSessionMachine.ts";
import { standbyPoolKey } from "./t3team-cloudSessionMachineNames.ts";
import type { CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";
import type { BrokerSession } from "./t3team-NexiBrokerClient.ts";
import type { NexiBrokerService } from "./t3team-NexiBrokerService.ts";

/**
 * Warm standbys (#562 option B): a project machine already up from its prebuilt image, waiting in
 * the broker for whoever starts a session in that project. Claiming one replaces the dispatch: the
 * broker hands the machine this user's repository token and the session to become, and the machine
 * becomes it in seconds instead of minutes. With none idle the session starts the cold way.
 *
 * A claimed run was dispatched by the pool controller, not this user, so it is not in the user's
 * run list: the broker's list of this user's sessions shows it once it is up, and until then this
 * server remembers its own claims (the ledger).
 */

/** A claim that has not shown up in the broker's list after this is reported as failed. */
const CLAIM_GRACE_MS = 12 * 60_000;
/** A failed or ended claim stays visible this long, then leaves the list. */
const CLAIM_KEEP_MS = 60 * 60_000;

interface ClaimedEntry {
  /** The GHE login the claim was made for: the list and cancel only ever show it that login's. */
  readonly login: string;
  readonly name: string;
  readonly startedAtMs: number;
  /** Seen in the broker's list at least once: it came up. */
  readonly seen: boolean;
}

export const makeClaimLedger = () => Ref.make(new Map<string, ClaimedEntry>());
export type ClaimLedger = Effect.Success<ReturnType<typeof makeClaimLedger>>;

/** Claims a standby for this session, or null when the broker has none idle for the project. */
export const claimStandby = (input: {
  readonly broker: NexiBrokerService["Service"];
  readonly machine: CloudSessionMachine;
  readonly workspace: string;
  readonly login: string;
  readonly name: string;
  readonly ledger: ClaimLedger;
  readonly nowMs: number;
}) =>
  Effect.gen(function* () {
    const { machine } = input;
    const runId = yield* input.broker.claimStandby({
      poolKey: standbyPoolKey(machine.repository),
      secrets: {
        GIT_TOKEN: machine.token,
        GIT_AUTHOR_NAME: machine.author.name,
        GIT_AUTHOR_EMAIL: machine.author.email,
      },
      session: {
        workspace: input.workspace,
        repository: machine.repository.url,
        commit: machine.commit,
        devcontainer: machine.devcontainerPath,
        healthCheck: machine.healthCheck ?? "",
      },
    });
    if (runId === null) return null;
    yield* Ref.update(input.ledger, (ledger) =>
      new Map(ledger).set(runId, {
        login: input.login,
        name: input.name,
        startedAtMs: input.nowMs,
        seen: false,
      }),
    );
    return runId;
  });

/**
 * The user's claimed sessions, for the list: each claim this server made, as the broker reports
 * it (ready once it is there), still starting before that, failed if it never came up. Run ids the
 * user's own run list already has are left to it.
 */
export const claimedSessions = (input: {
  readonly ledger: ClaimLedger;
  readonly login: string;
  readonly brokerSessions: ReadonlyArray<BrokerSession>;
  readonly knownRunIds: ReadonlySet<string>;
  readonly nowMs: number;
  readonly machineLabel: string;
  readonly repoRef: CloudSessionRepoRef;
}) =>
  Ref.modify(input.ledger, (ledger) => {
    const live = new Map(input.brokerSessions.map((session) => [session.runId, session]));
    const next = new Map<string, ClaimedEntry>();
    const sessions: CloudSession[] = [];
    for (const [runId, entry] of ledger) {
      const brokerSession = live.get(runId);
      const age = input.nowMs - entry.startedAtMs;
      const seen = entry.seen || brokerSession !== undefined;
      // Up and then gone: the session ended. Never up within the grace: it failed. Either way it
      // stays visible for a while, then the ledger forgets it.
      if (brokerSession === undefined && age > CLAIM_KEEP_MS) continue;
      next.set(runId, { ...entry, seen });
      if (entry.login !== input.login || input.knownRunIds.has(runId)) continue;
      const phase: CloudSession["phase"] =
        brokerSession !== undefined
          ? "ready"
          : seen
            ? "stopped"
            : age > CLAIM_GRACE_MS
              ? "failed"
              : "preparing";
      sessions.push({
        sessionId: runId,
        providerKind: "github_actions",
        phase,
        elapsedSeconds: Math.max(0, Math.floor(age / 1000)),
        remainingSeconds: null,
        machineLabel: input.machineLabel,
        failureReason: phase === "failed" ? "The warm machine did not come up." : null,
        detailsUrl: `https://${input.repoRef.host}/${input.repoRef.owner}/${input.repoRef.repo}/actions/runs/${runId}`,
        ...(brokerSession?.environmentId ? { environmentId: brokerSession.environmentId } : {}),
        name: entry.name,
        startedAt: DateTime.formatIso(DateTime.makeUnsafe(entry.startedAtMs)),
        transport: "nexi_broker",
        projectMachine: true,
      });
    }
    return [sessions, next] as const;
  });

/** True when `runId` is a session this server claimed for `login`. */
export const isClaimed = (ledger: ClaimLedger, runId: string, login: string) =>
  Ref.get(ledger).pipe(Effect.map((entries) => entries.get(runId)?.login === login));
