import type { ToolDocsTable } from "./t3team-toolDocs.ts";

const WORK_ITEM_FIELDS = {
  issue_id: "key like PROJ-12, in this project",
  body: "description (replaces) or comment text",
  assignee_account_id: "assignee op; null unassigns",
  estimate_value: "estimate op; null clears",
  estimate_mode: "estimate op: points or hours",
  target_status: "status op: state to move to",
  summary: "subtask_create: subtask title",
  description: "subtask_create: optional text",
  estimate_hours: "subtask_create: optional estimate",
  other_issue_id: "link_add: key to link",
  link_type_name: "link_add: link type",
  direction: "link_add: relation direction",
};

export const FORK_TOOL_DOCS: ToolDocsTable = {
  t3_show_widget: {
    description:
      "- Inline widget; don't re-describe\n- intent (builder) OR widget_code (replay)\n- format: html|svg auto, no network; rich-choice: choice only\n- bridge: sendPrompt(text), window.host.callTool (capabilities.tools)\n- theme/icons: t3_tool_help",
    fields: {
      title: "snake_case artifact name",
      widget_code: "SVG/HTML fragment, no html/body tags",
      capabilities: "tool ids for window.host.callTool",
      choice: "rich-choice: prompt, options[], multiple?, default_id?",
      multiple: "pick several; user presses Confirm",
      default_id: "shown first, not preselected",
    },
  },
  t3_mywork_arrange: {
    description:
      "- Store My Work layout; t3_mywork_digest first, only its ids\n- plan or reset:true; max 12 sections\n- kind: items(items[])|reviews(reviewIds)|graph(widget, no items)\n- placements: tickets side|main|footer; reviews side|main; yesterday side|footer",
    fields: {
      widget: "my-work.tickets|reviews|yesterday(last day merged/moved)",
      placement: "side=compact|main=grouped by story|footer=collapsed count",
      why: "one short line",
      reviewIds: "changeRequests[].id from digest",
      ticketId: "tickets[].id from digest",
    },
  },
  t3_ask_user: {
    description:
      "- Ask user a structured question\n- Returns at once; answer arrives next turn, don't re-ask\n- One pending question at a time\n- Pass context for any earlier content referenced\n- Mark choice '(recommended)' in label",
    fields: {
      question: "self-contained; markdown",
      context: "markdown of earlier thread content the question refers to",
      header: "short chip label",
      options: "string or {label, description = trade-off}",
      multiSelect: "pick several (with options)",
      allowFreeText: "false = options only (needs options)",
    },
  },
  t3_search_thread: {
    description:
      "- Search CURRENT thread's messages + tool activity (others: t3_thread_search)\n- query: substring\n- scope: all|messages|activities; order: recent|oldest\n- offset pages; hits: message_id (t3_read_message)|activity_id\n- question: direct answer",
    fields: {
      query: "substring; multi-word retried as all-words",
      role: "user|assistant|actor, or activity kind (e.g. bash)",
      question: "ask for a direct answer, not just matches",
      fromPosition: "1-based span start for question",
      toPosition: "1-based span end for question",
    },
  },
  t3_orchestration_run: {
    description:
      "- Run multi-agent orchestration; simple task: do directly\n- intent {goal, expectedOutcome, guardrails}\n- Or workflowPath (saved .workflow.ts as-is) | recipe(+action)\n- One launch per turn; replaceRunId stops active run\n- Returns runId; end turn",
    fields: {
      guardrails: "constraints, incl. which provider/model, in plain words",
      args: "orchestration input",
      recipe: "id from t3_recipe_list",
      replaceRunId: "active run to stop first",
      workflowPath: "saved .workflow.ts, run as-is",
    },
  },
  t3_work_item_draft: {
    description:
      "- Propose a work item change; user approves or dismisses, nothing is written\n- issue_id (key) required on every op, must be in this project\n- each arg is tagged with the op that uses it",
    fields: WORK_ITEM_FIELDS,
  },
  t3_work_item_change_set: {
    description:
      "- Propose up to 25 work item changes as one set; user approves each, nothing written\n- operations: t3_work_item_draft objects (op, issue_id, ...)\n- all or nothing; any invalid or foreign-project op = none proposed, failures listed by index",
    fields: WORK_ITEM_FIELDS,
  },
  t3_change_request_publish: {
    description:
      "- Commit, push, open PR/MR against base\n- Commits only listed paths onto branch (tip, else HEAD); index untouched\n- Pushes to origin; draft:true opens draft\n- Re-run safe: returns open change request\n- Returns url, number, projectId",
    fields: {
      paths: "repo-relative; directory = everything under it",
      base: "omit = default branch",
      branch: "head branch to publish",
      draft: "open as draft; default false",
    },
  },
  t3_task_ops: {
    description:
      "- op: watch(notify when silent)|unwatch|sweep(settle finished, verify first)|drain(claim own mailbox)|environments|help(op_name)\n- environments: read-only; delegate_task extensions.environment targets + delivery boundary (not t3_environment_links)",
    fields: {
      timeout: "watch: silence ms; default 15 min",
      all_older_than_hours: "sweep: finished children older than N hours",
      thread_id: "watch/unwatch target",
      thread_ids: "sweep targets",
      op_name: "help: op to explain",
    },
  },
  t3_mywork_digest: {
    description:
      "- Read My Work digest (read-only); no projectId: thread's project, else all Jira\n- tickets (use id, not key); claims = threads on a ticket; decisions = parked questions\n- changeRequests: viewerAuthored | viewerReviewRequested (= review requests)",
  },
  t3_machine_set_source: {
    description:
      "- Propose machine definition repo/branch; saves nothing, never say applied\n- t3_machine_find_definitions first; propose what it found\n- Fails if repo/branch unusable\n- Asks user accept or keep default; wait\n- One pending question per thread",
    fields: {
      repository: "owner/repo or https URL",
      branch: "default: repo's default branch",
      why: "1-2 sentences the user reads",
      author: "from t3_machine_find_definitions",
    },
  },
  t3_search_source: {
    description:
      "- Search FULL transcript of the thread this one was forked from (not current: t3_search_thread)\n- Forked threads only; has details compacted handoff left out\n- query: substring; scope: all|messages|activities; order: recent|oldest\n- Page with offset",
  },
  t3_orchestration_resume: {
    description:
      "- Resume paused/failed own run from journal\n- runId from run/status\n- 'Invalid inputs': resume same runId with corrected args\n- 'Agent turn failed': resume same runId\n- other failures: only once card offers it; source for ephemeral runs",
  },
  t3_machine_find_definitions: {
    description:
      "- Find machine definitions (read-only): .nexi/machine.json or devcontainer in project+linked repos, on branches, open PRs, PRs closed <30d\n- Call before asking user; propose result\n- Returns candidates, checked, unreadable, setupHints(Dockerfile etc)",
    fields: { projectId: "default: this thread's project" },
  },
  t3_work_item_search: {
    description:
      "- Search work items (read-only)\n- This project only; filters and jql ANDed\n- jql or unsynced project queries live, else synced copy (source mirror|live)\n- limit 1-50; pass nextCursor as cursor",
    fields: {
      jql: "extra JQL; forces live query",
      text: "free-text search",
      cursor: "nextCursor from previous page",
    },
  },
  t3_linked_repository_sync: {
    description:
      "- Clone or fetch a linked repository\n- Call before reading its code; read at localPath when state 'cloned' (not-cloned|failed|cloned in linked-repositories.json)\n- wait default true; wait:false queues large clones (can take minutes)",
    fields: {
      repository: "URL or owner/repo from linked-repositories.json",
      wait: "false = queue; default true",
    },
  },
  t3_provider_usage: {
    description:
      "- Read provider usage limits (read-only): session/weekly/monthly quota\n- Per provider instance + hub account: usedPercent, resetsAt, severity normal|warning|critical\n- Check before delegating long work\n- provider_instance_id filters",
    fields: { provider_instance_id: "id from orchestrator_capabilities" },
  },
  t3_work_item_get: {
    description:
      "- Read one work item by key (read-only)\n- Key must be in this project\n- Returns fields, description, comments (newest 50, commentsTruncated), links, children\n- Never read keys of other projects",
  },
  t3team_thread_skill_metadata: {
    description:
      "- Read skill names requested for this thread; call at session start\n- Returns {skills: string[]}; empty = no delegation\n- Resolve bodies yourself in your registry",
    fields: { threadId: "default: this thread; pass child's own id" },
  },
  t3_recipe_validate: {
    description:
      "- Statically validate orchestration; writes nothing\n- Pass source or path\n- Returns ok, errors[]; fix until ok before running",
    fields: {
      path: ".workflow.ts or recipe dir in workspace",
      source: "inline orchestration TS, same body as t3_orchestration_run",
    },
  },
  t3_orchestration_pause: {
    description:
      "- Pause own orchestration run at its waiting point (agent turn, user decision, timer)\n- runId from run/status\n- Resume with t3_orchestration_resume",
  },
  t3_orchestration_stop: {
    description:
      "- Stop own orchestration run for good\n- Cancels it, interrupts child turns\n- Use on superseded or stuck run before launching a replacement",
  },
  t3_recipe_list: {
    description:
      "- List runnable recipes (read-only): project's own and installed packs\n- Entry: id, title, recipePath, source project-local|pack\n- Pass recipePath to run or validate\n- Prefer existing over re-authoring",
  },
  t3_read_message: {
    description:
      "- Read full body of an inter-agent message in this thread\n- Long bodies are summarized on delivery\n- message_id from the delivery summary marker",
    fields: { message_id: "id in the delivered summary marker" },
  },
  request_desktop_route: {
    description:
      "- Ask user to route ONE host via their computer; only asks, never say applied\n- only when a cloud session cannot reach a host (DNS/connect/TLS)\n- user picks once|session|always|no; answer = next message: wait, retry\n- one pending question per thread",
    fields: {
      target: "One host/URL/IP/small range; no wildcard",
      reason: "What fails, why needed (user reads)",
      internal: "Private-network address",
    },
  },
};
