/**
 * The `migrate-project-state` recipe: copies a project's state dir into its new main repository
 * when a main-repository switch hands the migration to a thread. Scaffolded into
 * `<state dir>/recipes/migrate-project-state/workflow.ts`.
 *
 * The agent copies (target wins, exclusions kept) and reports conflicts, ignored files and what is
 * committable; a pull request is opened only when the person says so. The BODY records the outcome
 * through the recipe's `recordOutcome` script, so the status the app polls never depends on
 * prompt obedience.
 */
import { Schema } from "effect";
import { getArgs, getScripts, getThread, log, phase } from "@t3team/sdk";

export const Inputs = Schema.Struct({
  migrationId: Schema.String,
  fromRoot: Schema.String,
  toRoot: Schema.String,
  stateDir: Schema.String,
  excludes: Schema.Array(Schema.String),
  recordPath: Schema.String,
  isGitCheckout: Schema.Boolean,
  missingFilesAtLeast: Schema.Number,
});

export const meta = {
  name: "project.state-migration",
  description: "Copy a project's state into its new main repository and record the outcome.",
  inputs: Inputs,
  phases: [{ title: "Migrate" }, { title: "Record" }, { title: "Review" }],
  capabilities: ["script", "user"],
} as const;

const decodeInputs = Schema.decodeUnknownSync(Inputs);

const MigrationReport = Schema.Struct({
  copiedFiles: Schema.Number,
  remainingMissingFiles: Schema.Number,
  conflicts: Schema.Array(Schema.String),
  ignoredFiles: Schema.Number,
  committableFiles: Schema.Number,
  summary: Schema.String,
});

const PullRequestReport = Schema.Struct({
  pullRequestUrl: Schema.String,
  summary: Schema.String,
});

interface RecordOutcomeArgs {
  readonly recordPath: string;
  readonly migrationId: string;
  readonly outcome: "completed" | "failed";
  readonly summary?: string;
  readonly conflicts?: number;
  readonly pullRequestUrl?: string;
  readonly error?: string;
}

interface MigrationScripts {
  recordOutcome(args: RecordOutcomeArgs): Promise<{ readonly recorded: boolean }>;
}

/** The default copy, exactly the app's inline rules: regular files only, target wins. */
function referenceCopyCommand(source: string, target: string): string {
  return [
    "rsync -a --ignore-existing --no-links --no-specials --no-devices",
    "--exclude='/child-session-worktrees/'",
    "--include='/references/reference-repositories.json'",
    "--exclude='/references/*'",
    `'${source}/' '${target}/'`,
  ].join(" ");
}

export default async function run() {
  const input = decodeInputs(getArgs());
  const thread = getThread();
  if (thread === undefined) {
    throw new Error("migrate-project-state needs the thread it was launched on.");
  }
  const scripts = getScripts<MigrationScripts>();
  const source = input.fromRoot + "/" + input.stateDir;
  const target = input.toRoot + "/" + input.stateDir;

  // No try/catch: an ask parks the run by throwing through the body. A run that fails or is
  // cancelled before recording is marked failed by the status route from the run row.
  phase("Migrate");
  const report = await thread.askAgent(
    `Migrate this project's state directory into its new main repository.

Source (copy FROM, never modify): ${source}
Target (copy INTO): ${target}
At least ${input.missingFilesAtLeast} source files are missing from the target.

Keep the app's migration rules exactly:
1. Target wins. Never overwrite or delete a file that already exists in the target; copy only the regular files it lacks, keeping their relative layout.
2. Never copy these source entries (relative to the state directory): ${input.excludes.join("; ")}. Reference clones and child worktrees stay where they are; the copied reference manifest keeps pointing at them by absolute path.
3. Leave the source untouched, and never edit ${input.toRoot}/${input.recordPath}: this workflow records the outcome there itself.

Copy in bulk with one command, not file by file. The reference command is:
${referenceCopyCommand(source, target)}
Use an equivalent only when rsync is unavailable. Then count the non-excluded source files still missing from the target (remainingMissingFiles; 0 when the copy succeeded).

A file present in both with different contents is a conflict: keep the target's version and list its state-directory-relative path (at most 50 paths). Do not try to merge them.

${
  input.isGitCheckout
    ? `The target is inside a git checkout. ${input.stateDir}/references/ and ${input.stateDir}/child-session-worktrees/ must stay ignored; add only those .gitignore lines if missing. Count the migrated files git ignores anyway (ignoredFiles, for example a broader ignore rule hiding team state), and the files under ${input.stateDir}/ that git status reports as new or modified (committableFiles). Do not stage, commit, branch or push.`
    : `The target is not a git checkout: change no .gitignore and report ignoredFiles and committableFiles as 0.`
}

Return exactly one JSON object with the keys copiedFiles, remainingMissingFiles, conflicts (array of paths), ignoredFiles, committableFiles and summary (one or two sentences for the person, naming any conflicts or ignored files).`,
    { label: "Copy the project state", schema: MigrationReport },
  );

  phase("Record");
  const copied = report.remainingMissingFiles === 0;
  await scripts.recordOutcome({
    recordPath: input.recordPath,
    migrationId: input.migrationId,
    outcome: copied ? "completed" : "failed",
    summary: report.summary,
    conflicts: report.conflicts.length,
    ...(copied ? {} : { error: `${report.remainingMissingFiles} files were not copied.` }),
  });
  log(
    copied
      ? "Recorded the state migration as completed."
      : "Recorded the state migration as failed.",
  );
  if (!copied || !input.isGitCheckout || report.committableFiles === 0) {
    return { summary: report.summary, copiedFiles: report.copiedFiles };
  }

  phase("Review");
  const openPullRequest = await thread.askUser(
    `${report.committableFiles} migrated project files in ${input.toRoot} can be committed. Open a pull request with them?`,
    {
      label: "Open a pull request?",
      schema: Schema.Boolean,
      labels: { true: "Open a pull request", false: "Not now" },
    },
  );
  if (!openPullRequest) return { summary: report.summary, copiedFiles: report.copiedFiles };

  const pullRequest = await thread.askAgent(
    `Open a pull request with the migrated project state in ${input.toRoot}.

Create a new branch from the checkout's current branch. Stage only the new or modified files under ${input.stateDir}/ and the .gitignore lines added for the migration, never ${input.stateDir}/references/ or ${input.stateDir}/child-session-worktrees/, and leave any other uncommitted change alone. Commit with a conventional message, push the branch, and open the pull request with the repository host's CLI.

Return exactly one JSON object with the keys pullRequestUrl and summary. When no pull request could be opened, return an empty pullRequestUrl and say why in summary.`,
    { label: "Open a pull request", schema: PullRequestReport },
  );
  const pullRequestUrl = pullRequest.pullRequestUrl.trim();
  await scripts.recordOutcome({
    recordPath: input.recordPath,
    migrationId: input.migrationId,
    outcome: "completed",
    summary: report.summary + " " + pullRequest.summary,
    ...(pullRequestUrl.length > 0 ? { pullRequestUrl } : {}),
  });
  return { summary: report.summary, copiedFiles: report.copiedFiles, pullRequestUrl };
}
