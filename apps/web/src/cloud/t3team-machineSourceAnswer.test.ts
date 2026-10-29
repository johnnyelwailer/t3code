import {
  MACHINE_SOURCE_ACCEPT_LABEL,
  MACHINE_SOURCE_DECLINE_LABEL,
  encodeMachineSourceQuestionId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { machineSourceAcceptedFrom } from "./t3team-machineSourceAnswer";

const setting = { repository: "https://nexplore.ghe.com/acme/tools.git", branch: "setup" };
const id = encodeMachineSourceQuestionId(setting);

describe("machineSourceAcceptedFrom", () => {
  it("returns the proposal when the user accepted it", () => {
    expect(machineSourceAcceptedFrom([{ id }], { [id]: MACHINE_SOURCE_ACCEPT_LABEL })).toEqual(
      setting,
    );
  });

  it("returns null when the user kept the default", () => {
    expect(machineSourceAcceptedFrom([{ id }], { [id]: MACHINE_SOURCE_DECLINE_LABEL })).toBeNull();
  });

  it("returns null for any other answer text, or none", () => {
    expect(machineSourceAcceptedFrom([{ id }], { [id]: "Yes, but use main instead" })).toBeNull();
    expect(machineSourceAcceptedFrom([{ id }], { [id]: "" })).toBeNull();
    expect(machineSourceAcceptedFrom([{ id }], {})).toBeNull();
  });

  it("returns null for a question that is not a machine-source proposal", () => {
    expect(
      machineSourceAcceptedFrom([{ id: "question-1" }], {
        "question-1": MACHINE_SOURCE_ACCEPT_LABEL,
      }),
    ).toBeNull();
  });

  it("returns null for multiple-choice shapes", () => {
    expect(machineSourceAcceptedFrom([{ id }], { [id]: [MACHINE_SOURCE_ACCEPT_LABEL] })).toBeNull();
    expect(
      machineSourceAcceptedFrom([{ id, multiSelect: true }], { [id]: MACHINE_SOURCE_ACCEPT_LABEL }),
    ).toBeNull();
  });
});
