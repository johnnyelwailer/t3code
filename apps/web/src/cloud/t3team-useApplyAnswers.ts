import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { useStableCallback } from "../hooks/useStableCallback";
import { useApplyDesktopRouteAnswer } from "./t3team-useApplyDesktopRouteAnswer";
import { useApplyMachineSourceAnswer } from "./t3team-useApplyMachineSourceAnswer";

/**
 * Every answer the app applies itself when the user submits a card: the machine source and the desktop
 * route. One hook, so the thread composer wires one call. The first applier that recognises the answer
 * wins; none recognises an ordinary answer (null).
 */
export function useApplyAnswers(thread: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
}) {
  const machineSource = useApplyMachineSourceAnswer(thread);
  const desktopRoute = useApplyDesktopRouteAnswer(thread);
  return useStableCallback(
    (
      questions: Parameters<typeof machineSource>[0],
      answers: Record<string, unknown>,
      requestId?: string,
    ): (() => Promise<void>) | null =>
      machineSource(questions, answers) ?? desktopRoute(questions, answers, requestId),
  );
}
