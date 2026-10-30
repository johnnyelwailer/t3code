import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { toastManager } from "../components/ui/toast";
import { useStableCallback } from "../hooks/useStableCallback";
import { useProjects } from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { cloudSessionEnvironment } from "../state/t3team-cloudSessions";
import { useAtomCommand } from "../state/use-atom-command";
import { captureMachineSourceApply } from "./t3team-machineSourceCapture";

const SET_IN_SETTINGS = "You can set it in the project's settings under Cloud machine.";

const failureMessage = (failure: unknown) =>
  typeof failure === "object" && failure !== null && "message" in failure
    ? String(failure.message)
    : "The machine source could not be saved.";

/**
 * Applies the user's accepted machine-source proposal. The machine-setup agent runs in a cloud
 * session, but the setting belongs to the user's own (primary) environment, so the agent only asks
 * (`t3_machine_set_source`) and this saves the answer there, on the project the cloud thread's
 * project is a copy of. The outcome is always shown: it is never applied to a guessed project.
 *
 * Returns a function for the answer handler to call when the user SUBMITS: it captures the source
 * and the target project right then (the composer may show another thread by the time the answer
 * is delivered) and returns null for any answer that is not an accepted proposal, else a function
 * that saves it once the answer has gone through.
 */
export function useApplyMachineSourceAnswer(thread: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
}) {
  const save = useAtomCommand(cloudSessionEnvironment.setProjectMachineSource, {
    reportFailure: false,
  });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  return useStableCallback(
    (
      questions: Parameters<typeof captureMachineSourceApply>[0]["questions"],
      answers: Record<string, unknown>,
    ) => {
      const captured = captureMachineSourceApply({
        questions,
        answers,
        thread,
        primaryEnvironmentId,
        projects,
      });
      if (captured === null) return null;
      const { source, target } = captured;
      return async () => {
        if (target.kind !== "project") {
          toastManager.add({
            type: "warning",
            title: "Machine source not saved",
            description:
              target.kind === "none"
                ? `This project was not found on your own environment. ${SET_IN_SETTINGS}`
                : `Several of your projects match this one, so none was changed. ${SET_IN_SETTINGS}`,
          });
          return;
        }
        const { project } = target;
        const outcome = await save({
          environmentId: project.environmentId,
          input: { projectId: project.id, source },
        });
        if (outcome._tag === "Success") {
          toastManager.add({
            type: "success",
            title: `Saved the machine source for ${project.title}`,
          });
          return;
        }
        if (isAtomCommandInterrupted(outcome)) return;
        toastManager.add({
          type: "error",
          title: "Machine source not saved",
          description: `${failureMessage(squashAtomCommandFailure(outcome))} ${SET_IN_SETTINGS}`,
        });
      };
    },
  );
}
