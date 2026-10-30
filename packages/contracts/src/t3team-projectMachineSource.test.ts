import { describe, expect, it } from "vite-plus/test";
import * as Base64Url from "effect/encoding/Base64Url";

import {
  MACHINE_SOURCE_ACCEPT_LABEL,
  MACHINE_SOURCE_DECLINE_LABEL,
  MACHINE_SOURCE_QUESTION_HEADER,
  MACHINE_SOURCE_QUESTION_PREFIX,
  decodeMachineSourceQuestionId,
  encodeMachineSourceQuestionId,
  escapeMarkdownText,
  machineSourceAcceptedFrom,
  machineSourceQuestionLine,
} from "./t3team-projectMachineSource.ts";

const URL_OF_TOOLS = "https://nexplore.ghe.com/acme/tools.git";
const idOf = (json: string) => `${MACHINE_SOURCE_QUESTION_PREFIX}${Base64Url.encode(json)}`;

describe("machine source question id", () => {
  it("round-trips a repository and a branch", () => {
    const id = encodeMachineSourceQuestionId({ repository: URL_OF_TOOLS, branch: "setup/dev" });
    expect(id.startsWith(MACHINE_SOURCE_QUESTION_PREFIX)).toBe(true);
    expect(decodeMachineSourceQuestionId(id)).toEqual({
      repository: URL_OF_TOOLS,
      branch: "setup/dev",
    });
  });

  it("round-trips a repository without a branch, and a branch without a repository", () => {
    const repositoryOnly = encodeMachineSourceQuestionId({ repository: URL_OF_TOOLS });
    const branchOnly = encodeMachineSourceQuestionId({ branch: "setup" });
    expect(decodeMachineSourceQuestionId(repositoryOnly)).toEqual({ repository: URL_OF_TOOLS });
    expect(decodeMachineSourceQuestionId(branchOnly)).toEqual({ branch: "setup" });
  });

  it("answers null for ids that are not a proposal, never throwing", () => {
    for (const id of [
      "",
      "question-1",
      MACHINE_SOURCE_QUESTION_PREFIX,
      `${MACHINE_SOURCE_QUESTION_PREFIX}%%%not-base64%%%`,
      idOf("not json"),
      idOf("{}"),
      idOf('{"repository":42}'),
      idOf('{"repository":""}'),
    ]) {
      expect(decodeMachineSourceQuestionId(id), id).toBeNull();
    }
  });

  it("refuses a repository with credentials, a query or a fragment", () => {
    for (const repository of [
      "https://user:token@nexplore.ghe.com/acme/tools.git",
      "https://token@nexplore.ghe.com/acme/tools.git",
      "https://nexplore.ghe.com/acme/tools.git?token=abc",
      "https://nexplore.ghe.com/acme/tools.git#abc",
      "http://nexplore.ghe.com/acme/tools.git",
      "git@nexplore.ghe.com:acme/tools.git",
    ]) {
      expect(
        decodeMachineSourceQuestionId(encodeMachineSourceQuestionId({ repository })),
        repository,
      ).toBeNull();
    }
  });
});

const proposal = { repository: URL_OF_TOOLS, branch: "setup" };
const proposalId = encodeMachineSourceQuestionId(proposal);
const card = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  header: MACHINE_SOURCE_QUESTION_HEADER,
  question: `${machineSourceQuestionLine(proposal)}\n\nWhy: because.`,
  ...extra,
});
const accept = (id: string) => ({ [id]: MACHINE_SOURCE_ACCEPT_LABEL });

describe("machineSourceQuestionLine", () => {
  it("names the host, repository and branch that accepting saves", () => {
    expect(machineSourceQuestionLine(proposal)).toBe(
      "Use nexplore.ghe.com/acme/tools on branch setup for this project's cloud machine?",
    );
    expect(
      machineSourceQuestionLine({ repository: "https://evil.example/acme/tools.git" }),
    ).toContain("evil.example/acme/tools");
    expect(machineSourceQuestionLine({ branch: "setup" })).toContain("this project's repository");
  });

  it("is plain text: markdown in a branch name cannot restyle it", () => {
    const line = machineSourceQuestionLine({ repository: URL_OF_TOOLS, branch: "a_b*c" });
    expect(line).toContain("a\\_b\\*c");
  });
});

describe("escapeMarkdownText", () => {
  it("defuses links, code spans and auto-linked URLs", () => {
    const escaped = escapeMarkdownText("[acme/tools](https://evil) `x` https://evil.example");
    expect(escaped).not.toMatch(/(?<!\\)\]\(/);
    expect(escaped).not.toContain("`x`");
    expect(escaped).not.toContain("https://");
  });
});

describe("machineSourceAcceptedFrom", () => {
  it("returns the proposal when the user accepted the card that shows it", () => {
    expect(machineSourceAcceptedFrom([card(proposalId)], accept(proposalId))).toEqual(proposal);
  });

  it("returns null when the user kept the default", () => {
    expect(
      machineSourceAcceptedFrom([card(proposalId)], { [proposalId]: MACHINE_SOURCE_DECLINE_LABEL }),
    ).toBeNull();
  });

  it("returns null for any other answer text, or none", () => {
    expect(
      machineSourceAcceptedFrom([card(proposalId)], { [proposalId]: "Yes, but use main instead" }),
    ).toBeNull();
    expect(machineSourceAcceptedFrom([card(proposalId)], { [proposalId]: "" })).toBeNull();
    expect(machineSourceAcceptedFrom([card(proposalId)], {})).toBeNull();
  });

  it("returns null for a question that is not a machine-source proposal", () => {
    expect(machineSourceAcceptedFrom([card("question-1")], accept("question-1"))).toBeNull();
  });

  it("returns null for multiple-choice shapes", () => {
    expect(
      machineSourceAcceptedFrom([card(proposalId)], {
        [proposalId]: [MACHINE_SOURCE_ACCEPT_LABEL],
      }),
    ).toBeNull();
    expect(
      machineSourceAcceptedFrom([card(proposalId, { multiSelect: true })], accept(proposalId)),
    ).toBeNull();
  });

  it("refuses a forged card: an id for another host under text that shows acme/tools", () => {
    const evilId = encodeMachineSourceQuestionId({
      repository: "https://evil.example/acme/tools.git",
      branch: "setup",
    });
    // Text and header look like the real card, but the id would save the other host.
    expect(machineSourceAcceptedFrom([card(evilId)], accept(evilId))).toBeNull();
    // A card that shows what the id saves is applied: the user was shown the real host.
    const honest = {
      id: evilId,
      header: MACHINE_SOURCE_QUESTION_HEADER,
      question: machineSourceQuestionLine({
        repository: "https://evil.example/acme/tools.git",
        branch: "setup",
      }),
    };
    expect(machineSourceAcceptedFrom([honest], accept(evilId))).toEqual({
      repository: "https://evil.example/acme/tools.git",
      branch: "setup",
    });
  });

  it("refuses a card with another header or no question text", () => {
    expect(
      machineSourceAcceptedFrom([card(proposalId, { header: "Approach" })], accept(proposalId)),
    ).toBeNull();
    expect(machineSourceAcceptedFrom([{ id: proposalId }], accept(proposalId))).toBeNull();
  });
});
