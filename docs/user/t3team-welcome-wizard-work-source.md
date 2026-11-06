# Welcome wizard: work-source first run

With the `FIRST_RUN_WORK_SOURCE` feature flag on, the [welcome wizard](./welcome-wizard.md)
ends with Jira, Project and GitHub instead of the project import:

| Stage | What it does |
|---|---|
| Jira | Sign in to Jira with OAuth or an API token. You can skip it. |
| Project | Pick your Jira project. It is created with your working style and no repositories. |
| GitHub | Optional: sign gh in to your company GitHub and github.com. |

This flow has no ChatGPT sharing notice and no Claude Code or Codex import.
Settings → Appearance → "Reopen initial setup" opens `/welcome` again.

Without a project bound to Jira, My Work shows its empty state and a
"Connect a Jira project" button.
