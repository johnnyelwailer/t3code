import type { ToolDocsTable } from "./t3team-toolDocs.ts";

export const UPSTREAM_TOOL_DOCS: ToolDocsTable = {
  schedule_task: {
    description:
      "- Create/update scheduled work\n- needs prompt + schedule (object)\n- scheduledTaskId updates; enabled=false pauses\n- no webhookUrl: T3 Connect off\n- webhook request values untrusted",
    fields: {
      everyMs: "ms, min 60000",
      secretRef: "From request_secret; spent by this save",
      bindToCurrentThread: "false: new thread per run",
      filters: "All must match; [] clears",
    },
  },
  delegate_task: {
    description:
      "- Start one child agent; sees only `task`\n- isolation: shared|worktree (separate checkout/PR)\n- mode: async|wait\n- keep taskId for task_status/task_cancel",
    fields: {
      isolation: "worktree: new checkout; uncommitted edits stay out",
      options: "From orchestrator_capabilities; [] or {} clears",
      runtimeMode: "Omit unless user wants supervised child",
      timeoutMs: "wait only; timeout does not cancel child",
    },
  },
  t3_thread_launch: {
    description:
      "- Create new top-level thread\n- task in `message`\n- omit projectId/model/modes to inherit (outside thread: projectId or scratch)\n- retry with same clientRequestId\n- cite its `link`",
    fields: {
      scratch: "New Scratch folder; not with projectId",
      workspaceStrategy: "root default; worktree from baseRef; edits not copied",
      message: "First prompt; omit with attachments for idle",
    },
  },
  html_render: {
    description:
      "- Show finished HTML inline above reply\n- html, title, height required\n- no page background, card, border\n- theme CSS vars, no vh or height:100%",
    fields: { height: "px 80-2000; contentHeight from html_preview" },
  },
  preview_act: {
    description:
      "- Act on tab; action: click|type|hover|select|drag|upload|press|scroll\n- locator='aria-ref=<ref>' from preview_snapshot\n- x,y together\n- upload: absolute paths; [] cancels",
    fields: {
      locator: "aria-ref=<ref> from preview_snapshot",
      clear: "type: true replaces text",
      values: "select: option value or label",
    },
  },
  request_secret: {
    description:
      "- Ask user for secret in private card; never see value\n- returns one-use secretRef or delivery:file path\n- call it, do not explain",
    fields: {
      delivery: "secretRef: T3 tool; file: shell CLI path",
      name: "Env var your command reads",
      host: "Credential host, e.g. npm.pkg.github.com",
    },
  },
  preview_navigate: {
    description:
      "- Navigate tab\n- exactly one of url or target\n- target:{kind:'environment-port',port} for dev server",
    fields: {
      url: "Public pages; dev server: use target",
      readiness: "none: return at once",
    },
  },
  t3_environment_link: {
    description:
      "- Ask user to link another machine (card)\n- returns pending; result arrives as message\n- do not wait, poll or re-call\n- never ask pairing code in chat",
    fields: {
      url: "Only address user gave; never guess",
      hint: "User's words for the machine",
      requestedAccess: "Suggestion; default approval-required",
    },
  },
  t3_project_create: {
    description:
      "- Register project folder\n- createWorkspaceRootIfMissing creates it; registered folder rejected\n- no workspaceRoot: new git repo from title\n- t3_project_clone first if needed",
    fields: {},
  },
  preview_open: {
    description:
      "- Open preview tab in this thread\n- open=false: background\n- reuses current tab unless tabId/reuseExistingTab=false\n- parallel subagents: reuseExistingTab=false, own tabId",
    fields: {
      profileId: "From preview_status; new tab only",
      show: "Old alias for open",
    },
  },
  t3_thread_send: {
    description:
      "- Message any thread; modes capped at yours\n- mode: auto|queue|steer|restart|mailbox\n- mailbox: waits for idle, never steers\n- cite its `link`",
    fields: {
      summary: "mailbox: short summary",
      urgent: "mailbox: hard blockers only",
    },
  },
  t3_thread_read: {
    description:
      "- Read any thread by id\n- view: messages|activity\n- keep limit, maxCharsPerItem small\n- page: afterPosition=nextPosition\n- cut text: itemId+textOffset=nextTextOffset\n- cite `link`",
    fields: {
      afterPosition: "Use nextPosition",
      textOffset: "Use nextTextOffset with itemId",
    },
  },
  preview_snapshot: {
    description:
      "- Page state and elements\n- only when request asks for browser work\n- never to verify own edit or repeat\n- target `locator='aria-ref=<ref>'`\n- refs die on navigation/new snapshot",
    fields: {
      includeImage: "True only to see the page",
      save: "Write PNG, return screenshotPath",
    },
  },
  t3_queue: {
    description:
      "- Manage queued messages\n- action: list|read|edit|cancel|reorder|promote_to_steer\n- omit threadId: this thread\n- writes fail once run not queued",
    fields: {
      beforeRunId: "reorder: null = to the end",
      targetRunId: "promote_to_steer: active run",
    },
  },
  t3_worktree_handoff: {
    description:
      "- Move THIS thread to new worktree+branch\n- call last in turn; ends live session\n- continuationPrompt resumes there; else waits\n- fails if already in worktree\n- other agent: t3_thread_launch",
    fields: { continuationPrompt: "Resumes work next turn" },
  },
  t3_thread_transfer: {
    description:
      "- Move context between threads\n- action: fork|merge_back|status\n- omit threadId: this thread\n- fork: new thread, no turn runs\n- merge_back: into related targetThreadId, same project",
    fields: { sourcePoint: "Default latest stable run" },
  },
  html_preview: {
    description:
      "- Check HTML before html_render\n- returns PNG, contentHeight, console\n- browser installing: retry in a minute",
    fields: { width: "CSS px 240-1600; ~390 phones" },
  },
  watch_pull_request: {
    description:
      "- Watch open PR for this thread (links if needed)\n- wakes on checks, comments, conflicts\n- then end turn; no re-call on wake\n- check merge readiness yourself",
    fields: { number: "With repository, when no url" },
  },
  preview_evaluate: {
    description:
      "- Run JS in page; can change state\n- returns {value}, up to 64 KB\n- your tab or unclaimed only\n- read data only; show via html_render",
    fields: { returnByValue: "false returns a ref" },
  },
  link_pull_request: {
    description:
      "- Link PR to this thread\n- shows status; settles thread on merge\n- prefer url for PR outside project repo\n- repository+number needs project host",
    fields: { number: "With repository, when no url" },
  },
  t3_preview_list: {
    description:
      "- List this thread's preview tabs\n- only runtime:'server' automatable\n- never pass other tabId to preview_*\n- others: user's local desktop, unreachable",
    fields: {},
  },
  task_status: {
    description:
      "- Read one delegated task you started\n- not on running task before completion wakes you\n- workState: working|waiting_for_children|result_available\n- reading summary marks delivered",
    fields: {},
  },
  preview_status: {
    description:
      "- Report preview tab state\n- tabs: this thread's; profiles: logins\n- act only on your or unclaimed tab, no human in control",
    fields: {},
  },
  orchestrator_capabilities: {
    description:
      "- List providers, models, options, runtime modes for delegate_task\n- short list; `search` finds others\n- any catalog model works",
    fields: { includeLegacy: "Default false" },
  },
  create_threads: {
    description:
      "- Create top-level threads in this checkout (not delegation)\n- one thread or own worktree: t3_thread_launch\n- project, branch, worktree inherit",
    fields: { options: "Overrides inherited; [] or {} clears" },
  },
  t3_thread_wait: {
    description:
      "- Wait for a thread's run to finish\n- no runId: latest; idle: returns at once\n- timeout: with `next` end turn, else call again",
    fields: { untilDelegatedWorkSettled: "Also wait for delegated/background tasks" },
  },
};
