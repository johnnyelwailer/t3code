import { describe, expect, it } from "vite-plus/test";
import * as Base64Url from "effect/encoding/Base64Url";

import {
  MACHINE_SOURCE_ACCEPT_LABEL,
  MACHINE_SOURCE_DECLINE_LABEL,
  MACHINE_SOURCE_QUESTION_PREFIX,
  decodeMachineSourceQuestionId,
  encodeMachineSourceQuestionId,
  machineSourceAcceptedFrom,
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
describe("machineSourceAcceptedFrom", () => {
  it("returns the proposal when the user accepted it", () => {
    expect(
      machineSourceAcceptedFrom([{ id: proposalId }], {
        [proposalId]: MACHINE_SOURCE_ACCEPT_LABEL,
      }),
    ).toEqual(proposal);
  });

  it("returns null when the user kept the default", () => {
    expect(
      machineSourceAcceptedFrom([{ id: proposalId }], {
        [proposalId]: MACHINE_SOURCE_DECLINE_LABEL,
      }),
    ).toBeNull();
  });

  it("returns null for any other answer text, or none", () => {
    expect(
      machineSourceAcceptedFrom([{ id: proposalId }], {
        [proposalId]: "Yes, but use main instead",
      }),
    ).toBeNull();
    expect(machineSourceAcceptedFrom([{ id: proposalId }], { [proposalId]: "" })).toBeNull();
    expect(machineSourceAcceptedFrom([{ id: proposalId }], {})).toBeNull();
  });

  it("returns null for a question that is not a machine-source proposal", () => {
    expect(
      machineSourceAcceptedFrom([{ id: "question-1" }], {
        "question-1": MACHINE_SOURCE_ACCEPT_LABEL,
      }),
    ).toBeNull();
  });

  it("returns null for multiple-choice shapes", () => {
    expect(
      machineSourceAcceptedFrom([{ id: proposalId }], {
        [proposalId]: [MACHINE_SOURCE_ACCEPT_LABEL],
      }),
    ).toBeNull();
    expect(
      machineSourceAcceptedFrom([{ id: proposalId, multiSelect: true }], {
        [proposalId]: MACHINE_SOURCE_ACCEPT_LABEL,
      }),
    ).toBeNull();
  });
});
