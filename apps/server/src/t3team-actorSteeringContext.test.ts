import { MessageId, TurnId, type OrchestrationMessage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import * as DateTime from "effect/DateTime";

import {
  STEERING_MAX_AGENT_TURNS_DEFAULT,
  STEERING_MAX_AGE_MS_DEFAULT,
  appendHumanSteeringInstruction,
  buildHumanSteeringInstruction,
  detectHumanSteeringState,
  resolveSteeringMaxAgentTurns,
  resolveSteeringMaxAgeMs,
} from "./t3team-actorSteeringContext.ts";

// Fixed "now" for every test: the signal is a pure function of message
// roles + timestamps, so one shared clock keeps the cases readable.
const NOW_MS = Date.parse("2026-07-19T09:00:00.000Z");
// ISO-8601 UTC timestamps built via Effect DateTime (not `new Date()`, which
// trips effect(globalDate)); yields the identical `...Z` string the module
// round-trips through `Date.parse`.
const iso = (offsetMs: number) => DateTime.makeUnsafe(NOW_MS + offsetMs).toJSON();

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;

function userMessage(atOffsetMs: number, actor = false): OrchestrationMessage {
  const createdAt = iso(atOffsetMs);
  return {
    id: MessageId.make(nextId("msg")),
    text: "body",
    role: "user",
    turnId: TurnId.make(nextId("turn")),
    streaming: false,
    createdAt,
    updatedAt: createdAt,
    ...(actor
      ? {
          t3teamExt: {
            actor: { senderThreadId: "s", urgency: "normal", hopCount: 1, rootThreadId: "r" },
          },
        }
      : {}),
  } as OrchestrationMessage;
}

function assistantMessage(atOffsetMs: number): OrchestrationMessage {
  const createdAt = iso(atOffsetMs);
  return {
    id: MessageId.make(nextId("msg")),
    text: "body",
    role: "assistant",
    turnId: TurnId.make(nextId("turn")),
    streaming: false,
    createdAt,
    updatedAt: createdAt,
  } as OrchestrationMessage;
}

describe("detectHumanSteeringState", () => {
  it("is steering when a user message is fresh and the agent has not turned since", () => {
    const messages = [userMessage(-3 * 60 * 1000)];
    expect(detectHumanSteeringState(messages, NOW_MS)).toEqual({
      kind: "steering",
      lastUserMessageAgeMs: 3 * 60 * 1000,
      agentTurnsSinceLastUserMessage: 0,
    });
  });

  it("is steering within the default agent-turn window even when the message is older", () => {
    // 3 hours old, but only ONE agent turn since: the human's instruction is
    // still the active context.
    const messages = [userMessage(-3 * 60 * 60 * 1000), assistantMessage(-5 * 60 * 1000)];
    expect(detectHumanSteeringState(messages, NOW_MS)).toEqual({
      kind: "steering",
      lastUserMessageAgeMs: 3 * 60 * 60 * 1000,
      agentTurnsSinceLastUserMessage: 1,
    });
  });

  it("is idle when both sub-signals are stale", () => {
    // 3 hours old AND three agent turns since: the human is not at the keyboard.
    const messages = [
      userMessage(-3 * 60 * 60 * 1000),
      assistantMessage(-2 * 60 * 60 * 1000),
      assistantMessage(-90 * 60 * 1000),
      assistantMessage(-10 * 60 * 1000),
    ];
    expect(detectHumanSteeringState(messages, NOW_MS)).toEqual({ kind: "idle" });
  });

  it("is steering within the default age window even after several agent turns", () => {
    // 5 minutes old but four fast agent turns: the human typed recently.
    const messages = [
      userMessage(-5 * 60 * 1000),
      assistantMessage(-4 * 60 * 1000),
      assistantMessage(-3 * 60 * 1000),
      assistantMessage(-2 * 60 * 1000),
      assistantMessage(-1 * 60 * 1000),
    ];
    expect(detectHumanSteeringState(messages, NOW_MS)).toEqual({
      kind: "steering",
      lastUserMessageAgeMs: 5 * 60 * 1000,
      agentTurnsSinceLastUserMessage: 4,
    });
  });

  it("ignores inter-agent reaction inputs — they are not human messages", () => {
    // Only inter-agent "user" inputs exist: no real user has spoken.
    const messages = [userMessage(-60 * 1000, true), assistantMessage(-50 * 1000)];
    expect(detectHumanSteeringState(messages, NOW_MS)).toEqual({ kind: "idle" });
  });

  it("keys on the MOST RECENT user message, not the first", () => {
    // Old user message + a recent one: the recent one resets the window.
    const messages = [
      userMessage(-3 * 60 * 60 * 1000),
      assistantMessage(-3 * 60 * 60 * 1000 + 60 * 1000),
      userMessage(-2 * 60 * 1000),
    ];
    expect(detectHumanSteeringState(messages, NOW_MS)).toEqual({
      kind: "steering",
      lastUserMessageAgeMs: 2 * 60 * 1000,
      agentTurnsSinceLastUserMessage: 0,
    });
  });

  it("is idle with no messages", () => {
    expect(detectHumanSteeringState([], NOW_MS)).toEqual({ kind: "idle" });
    expect(detectHumanSteeringState(null, NOW_MS)).toEqual({ kind: "idle" });
  });

  it("honors the tunable window bounds", () => {
    const messages = [
      userMessage(-5 * 60 * 1000),
      assistantMessage(-4 * 60 * 1000),
      assistantMessage(-3 * 60 * 1000),
      assistantMessage(-2 * 60 * 1000),
    ];
    // Defaults: 4 turns > 2, but 5 min < 10 min → steering.
    expect(detectHumanSteeringState(messages, NOW_MS).kind).toBe("steering");
    // Tighten BOTH bounds: 4 > 1 turns AND 5 min > 1 min → idle.
    expect(
      detectHumanSteeringState(messages, NOW_MS, { maxAgentTurns: 1, maxAgeMs: 60 * 1000 }),
    ).toEqual({ kind: "idle" });
  });

  it("exposes the documented defaults", () => {
    expect(STEERING_MAX_AGENT_TURNS_DEFAULT).toBe(2);
    expect(STEERING_MAX_AGE_MS_DEFAULT).toBe(10 * 60 * 1000);
    const savedTurns = process.env["T3TEAM_STEERING_MAX_AGENT_TURNS"];
    const savedAge = process.env["T3TEAM_STEERING_MAX_AGE_MS"];
    try {
      process.env["T3TEAM_STEERING_MAX_AGENT_TURNS"] = "7";
      process.env["T3TEAM_STEERING_MAX_AGE_MS"] = "12345";
      expect(resolveSteeringMaxAgentTurns()).toBe(7);
      expect(resolveSteeringMaxAgeMs()).toBe(12345);
      process.env["T3TEAM_STEERING_MAX_AGENT_TURNS"] = "not-a-number";
      expect(resolveSteeringMaxAgentTurns()).toBe(STEERING_MAX_AGENT_TURNS_DEFAULT);
    } finally {
      if (savedTurns === undefined) delete process.env["T3TEAM_STEERING_MAX_AGENT_TURNS"];
      else process.env["T3TEAM_STEERING_MAX_AGENT_TURNS"] = savedTurns;
      if (savedAge === undefined) delete process.env["T3TEAM_STEERING_MAX_AGE_MS"];
      else process.env["T3TEAM_STEERING_MAX_AGE_MS"] = savedAge;
    }
  });
});

describe("buildHumanSteeringInstruction", () => {
  it("injects the carve-out line when steering and a parent exists", () => {
    const instruction = buildHumanSteeringInstruction(
      { kind: "steering", lastUserMessageAgeMs: 4 * 60 * 1000, agentTurnsSinceLastUserMessage: 1 },
      "parent-thread",
    );
    expect(instruction).toBe(
      "[A human is steering this thread right now (last user message ~4 min ago). " +
        "Respond to them directly. Do NOT send inter-agent messages to the parent unless " +
        "they explicitly ask.]",
    );
    // The "unless they explicitly ask" carve-out is essential: a legitimate
    // "tell the parent about X" must still work.
    expect(instruction).toContain("unless they explicitly ask");
  });

  it("rounds sub-minute ages up to one minute", () => {
    const instruction = buildHumanSteeringInstruction(
      { kind: "steering", lastUserMessageAgeMs: 30 * 1000, agentTurnsSinceLastUserMessage: 0 },
      "parent-thread",
    );
    expect(instruction).toContain("~1 min ago");
  });

  it("is a no-op for root threads / no parent", () => {
    const state = {
      kind: "steering",
      lastUserMessageAgeMs: 60 * 1000,
      agentTurnsSinceLastUserMessage: 0,
    } as const;
    expect(buildHumanSteeringInstruction(state, null)).toBe("");
    expect(buildHumanSteeringInstruction(state, undefined)).toBe("");
  });

  it("is a no-op when the signal is idle", () => {
    expect(buildHumanSteeringInstruction({ kind: "idle" }, "parent-thread")).toBe("");
  });
});

describe("appendHumanSteeringInstruction", () => {
  it("keeps the base EXACTLY when there is nothing to inject", () => {
    expect(appendHumanSteeringInstruction("base context", "")).toBe("base context");
  });

  it("appends the instruction as a suffix, keeping the base as a stable PREFIX", () => {
    const instruction = buildHumanSteeringInstruction(
      { kind: "steering", lastUserMessageAgeMs: 120 * 1000, agentTurnsSinceLastUserMessage: 0 },
      "parent-thread",
    );
    const result = appendHumanSteeringInstruction("base context", instruction);
    // Restart-rehydrate matching prefix-matches the stored input against the
    // rebuilt stable base — the suffix contract makes that keep working.
    expect(result.startsWith("base context")).toBe(true);
    expect(result.endsWith(instruction)).toBe(true);
  });
});
