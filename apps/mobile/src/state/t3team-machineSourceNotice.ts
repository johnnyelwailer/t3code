import { machineSourceAcceptedFrom } from "@t3tools/contracts";

import * as Dialog from "../components/ui/Dialog";

/**
 * The setup agent's machine-source proposal is saved on the user's own desktop environment, which
 * this app cannot reach, so an accepted proposal is only reported to the agent. Say so instead of
 * letting "accepted" read as saved, and show what to set on the desktop.
 */
export function noticeMachineSourceNotSaved(
  questions: Parameters<typeof machineSourceAcceptedFrom>[0],
  answers: Record<string, unknown>,
): void {
  const source = machineSourceAcceptedFrom(questions, answers);
  if (source === null) return;
  const what = [source.repository, source.branch === undefined ? null : `branch ${source.branch}`]
    .filter((part) => part !== null && part !== undefined)
    .join(", ");
  Dialog.alert(
    "Machine source not saved",
    `The agent was told you accepted, but this app cannot save it for your project. Open the desktop app and set it in the project's settings under Cloud machine: ${what}.`,
  );
}
