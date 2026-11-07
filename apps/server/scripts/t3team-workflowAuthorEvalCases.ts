/**
 * Realistic orchestration requests for the authoring eval, modelled on what users actually launched
 * (APK builds, PR watches, the daily sweep, multi-repo bumps, Windows project paths, long batches,
 * restart-safe pipelines). Every repository, path and number is synthetic.
 */
import type { WorkflowRunIntent } from "@t3team/sdk";

export interface WorkflowAuthorEvalCase {
  readonly id: string;
  /** What the user typed to the launching agent (caller mode). */
  readonly request: string;
  /** What the launching agent handed the author (author mode). */
  readonly intent: WorkflowRunIntent;
  readonly args: unknown;
}

const WINDOWS_PROJECT = "C:\\Users\\dev\\.t3code\\t3team\\projects\\Demo AI";

export const WORKFLOW_AUTHOR_EVAL_CASES: ReadonlyArray<WorkflowAuthorEvalCase> = [
  {
    id: "android-apk",
    request:
      "Build the Android release APK for apps/mobile: run the unit tests first, then assemble the release build, and tell me where the APK is plus a short test summary.",
    intent: {
      goal: "Run the mobile unit tests, then build the Android release APK for apps/mobile.",
      expectedOutcome: "The APK path and a pass/fail test summary.",
      guardrails: ["Do not publish or upload the APK.", "Stop if the tests fail."],
    },
    args: { appDir: "apps/mobile", variant: "release" },
  },
  {
    id: "pr-watch",
    request:
      "Watch PR #42 on acme/widgets until its checks finish. If a check fails, have an agent fix it and push; stop when it is green or after 3 fix attempts.",
    intent: {
      goal: "Keep PR #42 on acme/widgets green: watch its checks and fix failures.",
      expectedOutcome: "Checks green, or a report of what still fails after 3 attempts.",
      guardrails: ["At most 3 fix attempts.", "Never merge or force-push."],
    },
    args: { repository: "acme/widgets", number: 42, maxAttempts: 3 },
  },
  {
    id: "daily-sweep",
    request:
      "Every weekday at 08:00, sweep my open work items and PRs, summarize what needs my attention, and show me a digest.",
    intent: {
      goal: "Each weekday at 08:00 sweep open work items and PRs and summarize what needs attention.",
      expectedOutcome: "A digest shown to the user every weekday morning.",
      guardrails: ["Read-only: never change work items or PRs.", "Keep running across days."],
    },
    args: { time: "08:00", weekdays: [1, 2, 3, 4, 5] },
  },
  {
    id: "multi-repo",
    request:
      "Bump the shared logging library to 2.4.0 in the api, web and worker repos, run each repo's tests, and give me a per-repo result.",
    intent: {
      goal: "Upgrade @acme/logging to 2.4.0 in three repos and run each repo's tests.",
      expectedOutcome: "Per-repo result: upgraded yes/no, tests pass/fail, notes.",
      guardrails: ["One agent per repo.", "Do not push to the default branch."],
    },
    args: { repos: ["acme/api", "acme/web", "acme/worker"], version: "2.4.0" },
  },
  {
    id: "windows-paths",
    request: `Collect every TODO comment under ${WINDOWS_PROJECT}\\src and write a grouped report to ${WINDOWS_PROJECT}\\reports\\todo.md.`,
    intent: {
      goal: "Collect TODO comments in the project's src folder and write a grouped report.",
      expectedOutcome: "reports\\todo.md written, grouped by file, with a count.",
      guardrails: ["Only write the report file.", "Paths contain spaces and backslashes."],
    },
    args: { root: WINDOWS_PROJECT, report: `${WINDOWS_PROJECT}\\reports\\todo.md` },
  },
  {
    id: "long-batches",
    request:
      "Migrate the 40 test files in packages/core from jest to vitest in batches of 5, one agent per batch, review each batch, and stop and ask me if a batch fails.",
    intent: {
      goal: "Migrate packages/core tests from jest to vitest in batches of 5 with a review per batch.",
      expectedOutcome: "All batches migrated and reviewed, or a stop with the failing batch.",
      guardrails: ["Ask the user before continuing past a failed batch.", "Max 5 files per agent."],
    },
    args: { packageDir: "packages/core", batchSize: 5 },
  },
  {
    id: "restart-safe",
    request:
      "Draft release notes from the PRs merged since v1.8.0, let me approve them, then publish them as a draft release. It has to survive a server restart.",
    intent: {
      goal: "Collect merged PRs since v1.8.0, draft release notes, get user approval, publish a draft release.",
      expectedOutcome: "A draft release with approved notes.",
      guardrails: ["Publish only after the user approves.", "Must resume cleanly after a restart."],
    },
    args: { sinceTag: "v1.8.0" },
  },
  {
    id: "model-constraint",
    request:
      "Triage the 12 newest bug reports cheaply with the nexplore low model, then have Claude review the triage and pick the top 3.",
    intent: {
      goal: "Triage the 12 newest bug reports, then review the triage and pick the top 3.",
      expectedOutcome: "A triage table and the top 3 with reasons.",
      guardrails: ["Triage on nexplore 'low'; review on claude."],
    },
    args: { count: 12 },
  },
];
