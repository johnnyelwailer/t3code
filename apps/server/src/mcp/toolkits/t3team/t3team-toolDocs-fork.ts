import type { ToolDocsTable } from "./t3team-toolDocs.ts";

export const FORK_TOOL_DOCS: ToolDocsTable = {
  t3_show_widget: {
    description:
      "- Show widget inline in thread chat\n- intent OR widget_code (code needed for replay)\n- format: html|svg; no network\n- theme vars, icons, size rules: t3_tool_help\n- bridge tools: capabilities.tools",
    fields: {
      title: "snake_case artifact name",
      widget_code: "raw SVG or HTML fragment, no html/body tags",
      capabilities: "tools callable via window.host.callTool",
    },
  },
  t3_mywork_arrange: {
    description:
      "- Store My Work layout (writes)\n- call t3_mywork_digest first; use only its ids\n- plan or reset:true; max 12 sections\n- kind: items|reviews|graph (items[] required)\n- placement: side|main|footer; graph needs widget",
    fields: {
      widget: "my-work.tickets|reviews|yesterday",
      why: "one short line",
      reviewIds: "changeRequests[].id from digest",
      ticketId: "tickets[].id from digest",
    },
  },
  t3_ask_user: {
    description:
      "- Ask user a structured question\n- Returns at once; answer arrives next turn\n- One pending question at a time\n- Pass context for any earlier content referenced\n- Mark choice '(recommended)' in label",
    fields: {
      context: "markdown of earlier thread content the question refers to",
      header: "short chip label",
    },
  },
  t3_search_thread: {
    description:
      "- Search current thread messages and tool activity\n- query: substring\n- scope: all|messages|activities\n- order: recent|oldest\n- Page with offset when hasMore\n- question: get a direct answer",
    fields: {
      role: "message role or activity kind (e.g. bash)",
      question: "ask for a direct answer, not just matches",
      fromPosition: "1-based span start for question",
      toPosition: "1-based span end for question",
    },
  },
  t3_orchestration_run: {
    description:
      "- Launch multi-agent orchestration run\n- intent {goal, expectedOutcome, guardrails}\n- Or workflowPath | recipe(+action)\n- One launch per turn; replaceRunId stops active run\n- Returns runId; end turn after",
    fields: {
      args: "orchestration input",
      recipe: "id from t3_recipe_list",
      replaceRunId: "active run to stop first",
    },
  },
  t3_work_item_draft: {
    description:
      "- Propose change; user approves first\n- op: description|comment(body) assignee(assignee_account_id) estimate(estimate_value,estimate_mode) status(target_status) subtask_create(summary) link_add(other_issue_id,link_type_name,direction)",
    fields: {
      body: "description or comment text",
      assignee_account_id: "null unassigns",
      estimate_value: "null clears",
      target_status: "state to move to",
      summary: "subtask title",
      estimate_hours: "subtask estimate",
      other_issue_id: "key to link",
    },
  },
  t3_work_item_change_set: {
    description:
      "- Propose up to 25 work item changes as one set\n- nothing written until user approves; all or nothing\n- operations: t3_work_item_draft objects (same op/args), failures listed by index",
    fields: {
      body: "description or comment text",
      assignee_account_id: "null unassigns",
      estimate_value: "null clears",
      target_status: "state to move to",
      summary: "subtask title",
      estimate_hours: "subtask estimate",
      other_issue_id: "key to link",
    },
  },
  t3_change_request_publish: {
    description:
      "- Commit, push, open PR/MR (writes)\n- Commits only listed paths; index untouched\n- Pushes branch to origin\n- Re-run safe: returns open change request\n- Returns url, number, projectId",
    fields: {
      paths: "repo-relative; directory = everything under it",
      base: "omit = default branch",
    },
  },
  t3_task_ops: {
    description:
      "- Child-thread ops\n- op: watch|unwatch|sweep|drain|environments|help\n- watch: notify when silent; flags stuck vs pending tool\n- sweep: settle finished threads; verify first\n- drain: claim own mailbox",
    fields: {
      timeout: "silence ms; default 15 min",
      all_older_than_hours: "finished children older than N hours",
      thread_id: "watch/unwatch target",
      thread_ids: "sweep targets",
      op_name: "op to explain (for help)",
    },
  },
  t3_mywork_digest: {
    description:
      "- Read My Work digest (read-only)\n- projectId omitted: this thread's project, else all Jira projects\n- Use ticket id, not key, in arrangements\n- Returns tickets, changeRequests, claims, decisions",
  },
  t3_machine_set_source: {
    description:
      "- Propose machine definition repo/branch\n- Call t3_machine_find_definitions first\n- Saves nothing; asks user, then wait for answer\n- One pending question per thread",
    fields: {
      repository: "owner/repo or https URL",
      author: "from t3_machine_find_definitions",
    },
  },
  t3_search_source: {
    description:
      "- Search full transcript of fork's source thread\n- Forked threads only\n- query: substring\n- scope: all|messages|activities\n- order: recent|oldest\n- Page with offset",
  },
  t3_orchestration_resume: {
    description:
      "- Resume paused/failed own run from journal\n- runId from run/status\n- 'Invalid inputs': resume same runId with corrected args\n- 'Agent turn failed': resume same runId\n- source only for ephemeral runs",
  },
  t3_machine_find_definitions: {
    description:
      "- Find existing machine definitions (read-only)\n- Searches project and linked repos: branches, PRs\n- Call before asking user; propose what it finds\n- Returns candidates, checked, unreadable, setupHints",
  },
  t3_work_item_search: {
    description:
      "- Search work items (read-only)\n- This project only; filters and jql ANDed\n- jql or unsynced project queries live\n- limit 1-50; pass nextCursor as cursor",
    fields: {
      jql: "extra JQL; forces live query",
      text: "free-text search",
      cursor: "nextCursor from previous page",
    },
  },
  t3_linked_repository_sync: {
    description:
      "- Clone or fetch a linked repository\n- Call before reading its code; read at localPath when 'cloned'\n- wait default true; wait:false queues large clones",
    fields: {
      repository: "URL or owner/repo from linked-repositories.json",
    },
  },
  t3_provider_usage: {
    description:
      "- Read provider usage limits (read-only)\n- Per provider instance: usedPercent, resetsAt, severity\n- Check before delegating long work\n- Optional provider_instance_id filter",
    fields: {
      provider_instance_id: "id from orchestrator_capabilities",
    },
  },
  t3_work_item_get: {
    description:
      "- Read one work item by key (read-only)\n- Key must be in this project\n- Returns fields, description, comments (newest 50), links, children\n- Never read keys of other projects",
  },
  t3team_thread_skill_metadata: {
    description:
      "- Read skill names requested for this thread\n- Returns {skills: string[]}; empty = no delegation\n- Resolve bodies yourself in your registry",
    fields: {
      threadId: "default: this thread",
    },
  },
  t3_recipe_validate: {
    description:
      "- Statically validate orchestration; writes nothing\n- Pass source or path\n- Returns ok, errors[]; fix until ok before running",
    fields: {
      path: ".workflow.ts or recipe dir in workspace",
      source: "inline orchestration TypeScript",
    },
  },
  t3_orchestration_pause: {
    description:
      "- Pause own orchestration run at its waiting point\n- runId from run/status\n- Resume with t3_orchestration_resume",
  },
  t3_orchestration_stop: {
    description:
      "- Stop own orchestration run for good\n- Cancels it, interrupts child turns\n- Use before launching a replacement",
  },
  t3_recipe_list: {
    description:
      "- List runnable recipes (read-only)\n- Entry: id, title, recipePath, source project-local|pack\n- Pass recipePath to run or validate",
  },
  t3_read_message: {
    description:
      "- Read full inter-agent message body\n- message_id from the delivery summary marker",
    fields: {
      message_id: "id in the delivered summary marker",
    },
  },
};
