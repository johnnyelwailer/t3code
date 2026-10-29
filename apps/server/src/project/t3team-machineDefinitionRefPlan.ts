/**
 * Which refs of one repository a definition search reads, in priority order: the default branch,
 * open pull requests, recently closed ones, then the other branches. A commit is read once however
 * many refs point at it, and at most MAX_REFS_PER_REPOSITORY refs past the default are read:
 * `ls-remote` carries no dates, so branches with no pull request come last and are the ones cut.
 *
 * @module t3team-machineDefinitionRefPlan
 */
import type { MachineDefinitionCandidate } from "./t3team-machineDefinitionSearchResult.ts";
import type { SearchedPulls } from "./t3team-machineDefinitionPulls.ts";
import type { RemoteRefs } from "./t3team-machineDefinitionRefs.ts";

const MAX_REFS_PER_REPOSITORY = 20;

export interface PlannedRef {
  readonly ref: MachineDefinitionCandidate["ref"];
  readonly where: string;
  /** What `checked` lists. */
  readonly label: string;
  /** How a summary names it. */
  readonly describe: string;
  readonly commit: string;
  readonly author: string | null;
}

const oneLine = (text: string) =>
  // oxlint-disable-next-line no-control-regex -- a title is shown in a sentence
  text
    .replace(/[\u0000-\u001f\u007f\s]+/g, " ")
    .trim()
    .slice(0, 80);

export const planRefs = (input: { readonly refs: RemoteRefs; readonly pulls: SearchedPulls }) => {
  const { refs, pulls } = input;
  const missing: Array<number> = [];
  const pullRef = (pull: SearchedPulls["open"][number], open: boolean): PlannedRef[] => {
    const commit =
      refs.pulls.get(pull.number) ??
      refs.branches.find((branch) => branch.name === pull.headBranch)?.commit;
    if (commit === undefined) {
      missing.push(pull.number);
      return [];
    }
    return [
      {
        ref: {
          kind: "pr",
          number: pull.number,
          name: pull.headBranch,
          state: open ? "open" : "closed",
        },
        where: `${open ? "open" : "recently closed"} PR #${pull.number}`,
        label: `PR #${pull.number}`,
        describe: `${open ? "" : "closed "}PR #${pull.number} '${oneLine(pull.title)}'`,
        commit,
        author: pull.author?.login ?? null,
      },
    ];
  };
  const fromDefault: PlannedRef[] =
    refs.defaultCommit === null
      ? []
      : [
          {
            ref: { kind: "branch", name: refs.defaultBranch ?? undefined, state: "default" },
            where: "default branch",
            label: refs.defaultBranch ?? "default branch",
            describe: `the default branch${refs.defaultBranch === null ? "" : ` '${refs.defaultBranch}'`}`,
            commit: refs.defaultCommit,
            author: null,
          },
        ];
  const others: PlannedRef[] = refs.branches
    .filter((branch) => branch.name !== refs.defaultBranch)
    .map((branch): PlannedRef => ({
      ref: { kind: "branch", name: branch.name, state: "open" },
      where: "other branch",
      label: branch.name,
      describe: `branch '${branch.name}'`,
      commit: branch.commit,
      author: null,
    }));
  const seen = new Set<string>();
  const ordered = [
    ...fromDefault,
    ...pulls.open.flatMap((pull) => pullRef(pull, true)),
    ...pulls.closed.flatMap((pull) => pullRef(pull, false)),
    ...others,
  ].filter((entry) => !seen.has(entry.commit) && seen.add(entry.commit));
  const head = fromDefault.length;
  return {
    planned: ordered.slice(0, head + MAX_REFS_PER_REPOSITORY),
    omitted: Math.max(0, ordered.length - head - MAX_REFS_PER_REPOSITORY),
    missing,
  };
};
