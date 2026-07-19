import { describe, expect, it } from "vite-plus/test";

import { t3workHelp } from "./t3work-help.ts";

describe("agent-orchestration help contract", () => {
  it("documents the real durable scheduler and forbids fake timer workarounds", () => {
    const help = t3workHelp("agent-orchestration");
    expect(help).toContain("waitUntil(now() + durationMs)");
    expect(help).toContain("capabilities: ['schedule']");
    expect(help).toContain("persisted as sleeping with a wake time");
    expect(help).toContain("catches up immediately");
    expect(help).toContain("while (true)");
    expect(help).toContain("Do not poll");
    expect(help).toContain("shell sleep command");
    expect(help).toContain("external cron");
    expect(help).not.toMatch(/no native timers?/i);
    expect(help).not.toMatch(/multi-minute waits? (?:are|is) infeasible/i);
    expect(help).not.toMatch(/use (?:a )?polling loop/i);
  });

  it("advertises a focused timers topic with copyable durable examples", () => {
    expect(t3workHelp()).toContain("timers — Exact waitUntil/now syntax");
    expect(t3workHelp("agent-orchestration")).toContain('t3work_help("timers")');
    const timers = t3workHelp("timers");
    expect(timers).toContain("waitUntil(now() + 30 * SECOND)");
    expect(timers).toContain("capabilities: ['schedule', 'user']");
    expect(timers).toContain("label: 'Review daily risks'");
    expect(timers).toContain("while (true)");
    expect(timers).toContain("survives server restarts");
    expect(timers).toContain("already overdue");
    expect(timers).toContain('round very short remaining times to "Due now"');
  });

  it("requires evidence context before a user decision", () => {
    const help = t3workHelp("agent-orchestration");
    expect(help).toContain("Before askUser, surface the relevant results or evidence");
    expect(help).toContain("resource refs as attachments");
    expect(help).toContain("thread.notifyUser(...) with a concise evidence summary");
    expect(help).toContain("Never make the user reconstruct context");
  });
});
