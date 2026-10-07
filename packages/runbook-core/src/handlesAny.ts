/**
 * The any-of ask: park on SEVERAL resolvable branches at once and continue with whichever lands
 * first, replay-deterministically. Built on {@link HandleDispatch}, so it inherits the sticky
 * suspension latch, first-class abort, the black-box rule and refire refusal unchanged.
 *
 * Journal shape — ONE ask-shaped handle for the whole wait, never one per branch:
 *   • `sent` at the any-wait's own seq, `args` = `{ branches: [<branch args>, …] }`. The argsHash
 *     therefore pins the branch list: a re-driven body that reorders or changes it fails with
 *     replay drift instead of reading a winner index against a different list.
 *   • `resolved`, keyed by that correlationId, reply = {@link AnyWinner} `{ index, reply }`. This
 *     line IS the selection. The host writes it for the first branch that lands, and
 *     first-write-wins (`recordResolved`, `appendResolvedEntry`, `insertWireEntry`) refuses every
 *     later candidate, so a replay returns the same winner however many other branches have
 *     fired since. Nothing at replay time ever chooses.
 *
 * Why not one handle per branch plus a select entry: every losing branch would stay an open
 * correlation the host could still settle — swallowing an event the next wait needs — and the
 * select entry could only be journaled by the NEXT drive, after several branches may already have
 * resolved, forcing a list-order choice where arrival order was asked for. With one handle a losing
 * branch never becomes journal state; its later event finds no open correlation, and the host
 * delivers it to whatever the run waits on next.
 */

import { hashArgs } from "./canonicalJson.ts";
import { WorkflowError } from "./errors.ts";
import type { HandleDispatch, HandleSendCall } from "./handles.ts";
import type { PrimitiveKind } from "./primitiveKinds.ts";

/** The `resolved` reply of an any-wait: which branch won, and that branch's own reply. */
export interface AnyWinner {
  readonly index: number;
  readonly reply: unknown;
}

/** The host-side constructor for {@link AnyWinner}, so the envelope is spelled in one place. */
export function anyWinner(index: number, reply: unknown): AnyWinner {
  return { index, reply };
}

export interface AnyBranch<R> {
  /** Canonical-JSON identity of the branch: one element of the journaled `branches` list. */
  readonly args: unknown;
  /** Decode the winning reply into the branch's own type — the trust boundary, also on replay. */
  readonly decode: (reply: unknown) => R | Promise<R>;
}

export interface AnyAskCall<R> {
  readonly kind: PrimitiveKind;
  readonly refId: string;
  readonly branches: ReadonlyArray<AnyBranch<R>>;
  /** Fire the composite ask. The broker sees every branch and either settles the resolver with an
   * {@link AnyWinner} (an event already waiting) or records the park and returns. */
  readonly fire: HandleSendCall["fire"];
}

export interface AnyHit<R> {
  readonly index: number;
  readonly value: R;
}

/** Validate a journaled any-wait reply against the branch count it was sent with. */
export function decodeAnyWinner(
  correlationId: string,
  reply: unknown,
  branchCount: number,
): AnyWinner {
  const candidate = reply as Partial<AnyWinner> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Number.isInteger(candidate.index) ||
    (candidate.index as number) < 0 ||
    (candidate.index as number) >= branchCount ||
    !("reply" in candidate)
  ) {
    throw new WorkflowError(
      `Malformed any-wait reply for '${correlationId}': expected { index: 0..${branchCount - 1}, reply }.`,
    );
  }
  return { index: candidate.index as number, reply: candidate.reply };
}

/**
 * Journal one any-wait, fire it, and return the winning branch with its decoded value — or park
 * the run (the latch arms on the composite's single correlationId) until the host resolves it.
 * The branch list is validated before any seq is taken, so a refused call journals nothing.
 */
export async function awaitAny<R>(dispatch: HandleDispatch, call: AnyAskCall<R>): Promise<AnyHit<R>> {
  if (call.branches.length === 0) {
    throw new WorkflowError(`'${call.kind}' needs at least one branch.`);
  }
  const seen = new Map<string, number>();
  for (const [index, branch] of call.branches.entries()) {
    const identity = hashArgs(branch.args);
    const first = seen.get(identity);
    if (first !== undefined) {
      throw new WorkflowError(
        `'${call.kind}' branch ${index} duplicates branch ${first}; each branch must be distinct.`,
      );
    }
    seen.set(identity, index);
  }
  const correlationId = await dispatch.send({
    kind: call.kind,
    refId: call.refId,
    args: { branches: call.branches.map((branch) => branch.args) },
    fire: call.fire,
  });
  const winner = await dispatch.awaitResolution(correlationId, async (reply) =>
    decodeAnyWinner(correlationId, reply, call.branches.length),
  );
  return { index: winner.index, value: await call.branches[winner.index]!.decode(winner.reply) };
}
