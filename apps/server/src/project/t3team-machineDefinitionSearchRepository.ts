/**
 * Looks for machine definitions in one repository at its default branch, other branches, open
 * pull requests and recently closed ones. Each commit is scanned by `scanRemoteAtCommit`, the same
 * reader discovery uses, so a definition found here is one discovery would accept.
 *
 * @module t3team-machineDefinitionSearchRepository
 */
import * as Effect from "effect/Effect";

import { probeSetupHints } from "./t3team-machineDefinitionHints.ts";
import type { RemoteUnavailable } from "./t3team-machineDefinitionReader.ts";
import { planRefs, type PlannedRef } from "./t3team-machineDefinitionRefPlan.ts";
import { listSearchedPulls, type SearchedPulls } from "./t3team-machineDefinitionPulls.ts";
import { listRemoteRefs } from "./t3team-machineDefinitionRefs.ts";
import type { ScannedMachine } from "./t3team-machineDefinitionScan.ts";
import type {
  MachineDefinitionCandidate,
  MachineDefinitionSearchResult,
} from "./t3team-machineDefinitionSearchResult.ts";
import {
  remoteTarget,
  scanRemoteAtCommit,
  type RemoteMachineInput,
} from "./t3team-remoteMachineScan.ts";

const NO_PULLS: SearchedPulls = { open: [], closed: [], forks: [], partial: false };
const numbers = (list: ReadonlyArray<number>) => list.map((n) => `#${n}`).join(", ");

type Found = MachineDefinitionCandidate & { readonly hash: string };

const candidateOf = (repository: string, planned: PlannedRef, machine: ScannedMachine): Found => {
  const pointer = machine.machineFilePath !== null;
  const path = machine.machineFilePath ?? machine.devcontainerPath;
  return {
    repository,
    ref: planned.ref,
    where: planned.where,
    path,
    kind: pointer ? ".nexi/machine.json" : "devcontainer",
    author: planned.author,
    summary: pointer
      ? `${path} (devcontainer ${machine.devcontainerPath}) on ${planned.describe}`
      : `${path} on ${planned.describe}`,
    commit: planned.commit,
    hash: machine.hash,
  };
};

export const searchRepository = Effect.fn("machineSearch.searchRepository")(function* (
  input: RemoteMachineInput,
) {
  const target = yield* remoteTarget(input);
  const name = target.repository;
  const unreadable: Array<{ repository: string; reason: string }> = [];
  const note = (reason: string) => unreadable.push({ repository: name, reason });

  const pulls = yield* listSearchedPulls(target).pipe(
    Effect.catchTags({
      RemoteUnavailable: (error) => {
        note(`Pull requests were not searched. ${error.reason}`);
        return Effect.succeed(NO_PULLS);
      },
    }),
  );
  if (pulls.forks.length > 0)
    note(`Pull requests from forks were not searched: ${numbers(pulls.forks)}.`);
  if (pulls.partial) note("There are more pull requests than were listed; only the newest were searched.");
  const refs = yield* listRemoteRefs({
    url: input.url,
    cwd: input.cwd,
    pullNumbers: [...pulls.open, ...pulls.closed].map((pull) => pull.number),
  });
  if (refs.truncated) note("The branch list was too long; only the first branches were checked.");
  const { planned, omitted, missing } = planRefs({ refs, pulls });
  if (missing.length > 0) note(`No commit could be found for pull requests ${numbers(missing)}.`);

  const scans = yield* Effect.forEach(
    planned,
    (entry) =>
      scanRemoteAtCommit(target, entry.commit).pipe(
        Effect.map((scan) => ({
          entry,
          rejected: scan.rejected,
          found: scan.candidates.map((machine) => candidateOf(name, entry, machine)),
        })),
        Effect.catchTags({
          RemoteUnavailable: (error: RemoteUnavailable) => {
            note(`${entry.label} could not be read. ${error.reason}`);
            return Effect.succeed({ entry, rejected: [], found: [] as ReadonlyArray<Found> });
          },
        }),
      ),
    { concurrency: 4 },
  );
  for (const { entry, rejected } of scans)
    for (const candidate of rejected)
      note(`${entry.label} has ${candidate.path}, but it is unusable: ${candidate.reason}`);
  // A definition identical to one already found (a branch cut from the default) is not repeated.
  const seen = new Set<string>();
  const found = scans
    .flatMap((scan) => scan.found)
    .filter((candidate) => !seen.has(candidate.hash) && seen.add(candidate.hash));
  const kept = new Set(found.map((candidate) => candidate.commit));
  const hinted = scans.filter(
    ({ entry }) => entry.ref.state === "default" || kept.has(entry.commit),
  );
  const hints = yield* Effect.forEach(
    hinted,
    ({ entry }) =>
      probeSetupHints(target, entry.commit).pipe(
        Effect.map((paths) => paths.map((path) => ({ repository: name, ref: entry.ref, path }))),
      ),
    { concurrency: 2 },
  );
  return {
    candidates: found.map(({ hash: _hash, ...candidate }) => candidate),
    checked: [
      {
        repository: name,
        refs: planned.map((entry) => entry.label),
        // Skipped fork pull requests count too, so a search that left some out never reads 0.
        omitted: omitted + pulls.forks.length + (pulls.partial ? 1 : 0),
      },
    ],
    unreadable,
    setupHints: hints.flat(),
  } satisfies MachineDefinitionSearchResult;
});
