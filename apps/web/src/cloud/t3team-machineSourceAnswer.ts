import {
  MACHINE_SOURCE_ACCEPT_LABEL,
  type ProjectMachineSourceSetting,
  decodeMachineSourceQuestionId,
} from "@t3tools/contracts";

/**
 * The machine source the user accepted, from the questions of a request they just answered and
 * their answers (keyed by question id). Null for anything else: a declined proposal, other answer
 * text, a question that is not a machine-source proposal, or a multiple-choice shape.
 */
export function machineSourceAcceptedFrom(
  questions: ReadonlyArray<{ readonly id: string; readonly multiSelect?: boolean | undefined }>,
  answers: Record<string, unknown>,
): ProjectMachineSourceSetting | null {
  for (const question of questions) {
    if (question.multiSelect === true) continue;
    const proposal = decodeMachineSourceQuestionId(question.id);
    const answer = answers[question.id];
    if (proposal !== null && typeof answer === "string") {
      return answer.trim() === MACHINE_SOURCE_ACCEPT_LABEL ? proposal : null;
    }
  }
  return null;
}
