import "./t3team-sdk.globals.ts";

import { defineToolGroup } from "./t3team-sdk.ts";

export const githubRead = defineToolGroup({
  id: "github.read",
  label: "Read GitHub data",
  description:
    "View pull requests, issues, branches, commits, and files without mutating GitHub state.",
});

/**
 * Keep GitHub read and write scopes separate so workflow permission prompts can stay least-privilege by default.
 */
export const githubWrite = defineToolGroup({
  id: "github.write",
  label: "Modify GitHub",
  description:
    "Merge pull requests, push branches, edit issues, and trigger write-side GitHub actions.",
});

/**
 * Preparing a review a human then approves is NOT the same authority as changing GitHub, and this
 * group exists so the two cannot be conflated. `githubWrite` grants merging, pushing and editing;
 * a workflow that only wants to hand a reviewer a draft must not have to ask for any of that to
 * get it — that is precisely the least-privilege split `githubWrite`'s own doc comment above
 * describes, applied one level further.
 *
 * Nothing in this group reaches GitHub. A tool here produces a draft; the host holds the token and
 * posts only what the user approved, so the grant a user is being asked for is "let this workflow
 * put a review in front of me", not "let this workflow write to the repository".
 */
export const githubReviewDraft = defineToolGroup({
  id: "github.review.draft",
  label: "Draft a pull-request review",
  description:
    "Prepare a pull-request review — a verdict, a summary, and inline comments — for you to read and approve. Nothing is posted to GitHub without your approval.",
});

export const jiraRead = defineToolGroup({
  id: "jira.read",
  label: "Read Jira data",
  description:
    "View Jira issues, comments, fields, and project metadata without changing Jira state.",
});

export const jiraWrite = defineToolGroup({
  id: "jira.write",
  label: "Modify Jira",
  description: "Edit Jira issues, add comments, transition workflow state, and update assignments.",
});

export const t3teamRecipeRead = defineToolGroup({
  id: "t3team.recipe.read",
  label: "Read t3team project recipes",
  description:
    "List discovered t3team project recipes and statically validate recipe workflows without executing them.",
});

export const t3teamThreadWrite = defineToolGroup({
  id: "t3team.thread.write",
  label: "Modify t3team threads",
  description: "Rename threads, send workflow thread messages, and create child workflow threads.",
});

/**
 * Distinct from every other builtin group: those classify tools that read state or prepare a
 * draft the user still commits. This one runs an actual command against a real checkout — the
 * permission dialog must say so plainly, because approving it means trusting whatever the command
 * does, not just trusting a diff the user will review afterward.
 */
export const t3teamSandboxExecute = defineToolGroup({
  id: "t3team.sandbox.execute",
  label: "Run commands in a sandboxed checkout",
  description:
    "Check out a git ref into an isolated sandbox and run a command inside it (for example, the test suite or the app itself). The agent sees the command's exit code and everything it prints to stdout/stderr; the command executes with whatever access the sandbox grants it.",
});

export const releaseNotesWrite = defineToolGroup({
  id: "release-notes.write",
  label: "Write release notes artifacts",
  description: "Create or update release notes content and related project artifacts.",
});

export const builtinToolGroups = [
  githubRead,
  githubWrite,
  githubReviewDraft,
  jiraRead,
  jiraWrite,
  t3teamRecipeRead,
  t3teamThreadWrite,
  t3teamSandboxExecute,
  releaseNotesWrite,
] as const;
