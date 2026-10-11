import { useCallback, useRef, useState } from "react";

import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";

import { createJiraProject, type CreateJiraProjectInput } from "./t3team-createJiraProject";

export type CreateProjectSubmitState =
  | { readonly kind: "idle" }
  | { readonly kind: "creating" }
  | { readonly kind: "error"; readonly error: unknown };

const IDLE: CreateProjectSubmitState = { kind: "idle" };

/**
 * Runs the create and reports where it is.
 *
 * - One create at a time: a second call while one is running does nothing, so a double click can
 *   never create the project twice.
 * - A failure keeps the form exactly as it was — the user retries from the same screen, nothing to
 *   re-enter — and resolves to `null`. The failure belongs to the project (`scopeKey`) it happened
 *   for and is not shown on another one; a running create is shown whatever is on screen.
 * - Success leaves the state at "creating": the caller navigates away.
 */
export function useCreateProjectSubmit(scopeKey: string | undefined) {
  const backend = useBackend();
  const [raw, setRaw] = useState<{ state: CreateProjectSubmitState; scopeKey: string | undefined }>(
    { state: IDLE, scopeKey },
  );
  const inFlightRef = useRef(false);
  const state = raw.state.kind === "error" && raw.scopeKey !== scopeKey ? IDLE : raw.state;

  const submit = useCallback(
    async (input: Omit<CreateJiraProjectInput, "backend">): Promise<ProjectShellProject | null> => {
      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      setRaw({ state: { kind: "creating" }, scopeKey });
      try {
        if (!backend) throw new Error("Backend not available");
        return await createJiraProject({ ...input, backend });
      } catch (error) {
        setRaw({ state: { kind: "error", error }, scopeKey });
        inFlightRef.current = false;
        return null;
      }
    },
    [backend, scopeKey],
  );

  return { state, submit };
}
