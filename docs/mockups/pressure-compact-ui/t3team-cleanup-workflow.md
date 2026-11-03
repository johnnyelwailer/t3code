# Clean up resources: prompt and workflow (design, not built)

## Trigger

The drill-down's **Clean up…** button opens a **new visible thread** "Clean up resources" in the current project (default provider and model, default runtime mode, no extra privileges). Its first message is the prompt below, filled with the live numbers. It is editable before it is sent. Nothing runs without that send.

## First message (the prompt)

```
Free memory on this machine. Memory is {level}: {free} free of {total}.

Find what is no longer needed: processes of idle or finished threads, dev servers and
watchers, old worktrees, build caches. Do not stop or delete anything yet; ask me which
to free with the question tool.

Rules (the host enforces the first four; you follow the rest):
1. Never touch a running thread, a pinned thread, or a worktree with unpushed commits.
2. Only stop processes and delete worktrees that the inventory tool lists as unprotected.
3. A cache is deleted only if the inventory marks it rebuildable.
4. Nothing is stopped or deleted before I choose in the question tool. I never have to type an approval.
5. If anything is unclear (no PR, unknown owner, recently modified), offer it unticked in the same question; do not guess.
6. Report what you freed, per item, and what you left alone.
```

## Steps the agent takes

1. **Inventory (read only).** One host tool, `t3team.resources.inventory`, returns candidates: processes (pid, command, owning thread, thread state, idle time, RSS), worktrees (path, branch, PR state, dirty or unpushed, size, last used) and caches (path, size, rebuildable). Every row carries `protected: [reasons]` computed by the host: thread running, thread pinned, worktree has unpushed commits or uncommitted changes, process is not a descendant of this server.
2. **Classify.** The agent groups the unprotected rows into: safe (owner finished, PR merged and clean, rebuildable cache), unsure (no PR, unknown owner, recent activity), and untouchable (everything protected, summarised in one line).
3. **Ask.** One call of the question tool (multi-select, grouped by processes, worktrees, caches): each option shows size and reason, safe items are pre-ticked, unsure items are unticked and say why. The agent first says in one line what it will not touch. Nothing has changed at this point.
4. **Confirm.** The user ticks or unticks and presses "Free N selected" (or "Not now"). No typing. A ticked unsure item is the user's explicit choice.
5. **Act.** The agent calls `t3team.resources.stop` or `t3team.resources.remove` with the confirmed ids only. The host re-checks protection and identity (pid plus start time, as the existing cleanup does) at call time and refuses protected or changed items, so a stale list cannot do harm.
6. **Report.** Freed per item, refused items with the host's reason, and the new free memory.

## What enforces the protections

The prompt states the rules, but the tools enforce them: the inventory flags protection, and the two action tools accept only ids from a fresh inventory, re-verify protection at call time, and never take a path or a pid typed by the agent. Worktrees and caches are deleted only through these tools, never through a shell command the agent invents.

## Not decided yet (needs PJ)

- Whether the action tools need an approval prompt on top of the question-tool choice (default in this design: no, the choice is the approval).
- Whether "old worktrees" may include worktrees of other projects (design: current project's machine only, listed per project).
