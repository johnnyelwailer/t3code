/**
 * `waitForAny` — park on several signal branches at once and continue with whichever lands first.
 *
 * Each branch comes from `handle.on(signal, { key })` on a handle `getSignalSource` returned in
 * THIS run, so it already passed that source's `source:<name>` gate; a hand-built or foreign
 * descriptor is refused, because the host could never start a source for it.
 *
 * The wait is ONE journaled `signal.waitAny` handle over every branch (`awaitAny` in
 * `@runbook/core/handlesAny`): its `resolved` line `{ index, reply }` is the winner, first write
 * wins, so a replay returns the same branch however many others fire later. A branch that loses
 * never becomes a handle of its own; its later event reaches whatever the run waits on next.
 */

import { awaitAny } from "@runbook/core/handlesAny";
import type { HandleDispatch } from "@runbook/core/handles";
import type { MessageBroker } from "@runbook/threads/broker";

import { fromRun } from "./t3team-sdk.engineApi.ts";
import { PermissionDeniedError, WorkflowError } from "./t3team-sdk.errors.ts";
import { decodeSignalPayload, type SignalBranch } from "./t3team-sdk.signal.ts";

type BranchPayload<B> = B extends SignalBranch<infer P> ? P : never;

/** What `waitForAny` resolves to: a union discriminated on `index`, each member carrying the
 * payload type of the branch at that position — `if (hit.index === 2)` narrows `hit.payload`. */
export type SignalAnyHit<Branches extends ReadonlyArray<SignalBranch<unknown>>> = {
  [K in keyof Branches]: K extends `${infer I extends number}`
    ? {
        readonly index: I;
        readonly signal: string;
        readonly payload: BranchPayload<Branches[K]>;
      }
    : never;
}[number];

export type WaitForAny = <const Branches extends ReadonlyArray<SignalBranch<unknown>>>(
  branches: Branches,
) => Promise<SignalAnyHit<Branches>>;

/** The journaled identity of one branch — also the wire shape of a single `signal.wait`. */
const branchArgs = (branch: SignalBranch<unknown>) => ({
  source: branch.source,
  paramsHash: branch.paramsHash,
  signal: branch.signal.name,
  key: branch.key,
});

export function createWaitForAny(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
  /** True only for a branch `handle.on` minted in this run. */
  readonly isMinted: (branch: unknown) => boolean;
}): WaitForAny {
  const waitForAny = async (branches: ReadonlyArray<SignalBranch<unknown>>) => {
    if (!Array.isArray(branches)) {
      throw new WorkflowError("waitForAny expects an array of branches from handle.on(...).");
    }
    for (const [index, branch] of branches.entries()) {
      if (!deps.isMinted(branch)) {
        throw new WorkflowError(
          `waitForAny: branch ${index} was not created by handle.on(...) on a source bound in this run.`,
        );
      }
      const required = `source:${branch.source}`;
      if (!deps.capabilities.has(required)) {
        throw new PermissionDeniedError(
          `waitForAny branch ${index} watches '${branch.source}', which requires the '${required}' capability.`,
        );
      }
    }
    const wire = branches.map(branchArgs);
    const hit = await awaitAny(deps.dispatch, {
      kind: "signal.waitAny",
      refId: [...new Set(wire.map((branch) => branch.source))].join(","),
      branches: branches.map((branch, index) => ({
        args: wire[index],
        decode: (reply: unknown) => decodeSignalPayload(branch.signal, reply),
      })),
      fire: (correlationId, resolver) =>
        deps.broker.send(
          { correlationId, kind: "signal.waitAny", payload: { branches: wire } },
          resolver,
        ),
    });
    return { index: hit.index, signal: branches[hit.index]!.signal.name, payload: hit.value };
  };
  return waitForAny as WaitForAny;
}

/**
 * Park until the FIRST of several signals arrives (design 42). Build each branch with
 * `handle.on(signal, { key })` on a handle from `getSignalSource`; the result's `index` says which
 * branch won and narrows `payload` to that branch's type. Exactly one branch wins, and a resume
 * returns that same branch. A branch that lost is not left waiting: its event reaches the next
 * wait in the run instead, so a loop that re-binds its sources each iteration sees every event.
 */
export function waitForAny<const Branches extends ReadonlyArray<SignalBranch<unknown>>>(
  branches: Branches,
): Promise<SignalAnyHit<Branches>> {
  return fromRun<WaitForAny>("waitForAny")(branches);
}
