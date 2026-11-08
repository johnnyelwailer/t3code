import * as Effect from "effect/Effect";

/**
 * How a cloud-session create settled a project's machine, as one structured log line and span
 * attributes. Before this, a resolve failure left no trace on the server: the user could say what
 * the toast said and nothing else. Never carries a token or a clone URL.
 *
 * - `machine`: the project's own repository's machine will be built.
 * - `plain`: no usable machine definition in the project's own repository; `ignoredRepositories`
 *   are linked repositories that define one, deliberately not used.
 * - `rejected`: the project's own definition is broken (`rejected` is its path).
 * - `unusable`: a definition exists but cannot be fetched or cloned (`reason` is the failure).
 * - `plain_offered`: the create failed on the machine and a plain session was offered instead.
 * - `plain_unavailable`: the create failed on the machine and no plain session is possible either.
 */
export interface MachineOutcome {
  readonly outcome:
    | "machine"
    | "plain"
    | "rejected"
    | "unusable"
    | "plain_offered"
    | "plain_unavailable";
  readonly repository?: string;
  readonly reason?: string;
  readonly rejected?: string;
  readonly ignoredRepositories?: ReadonlyArray<string>;
}

export const logMachineOutcome = (projectId: string, outcome: MachineOutcome) => {
  const attributes = { projectId, ...outcome };
  const line = `Cloud session machine for project: ${outcome.outcome}`;
  return Effect.annotateCurrentSpan(attributes).pipe(
    Effect.andThen(
      outcome.outcome === "machine" || outcome.outcome === "plain"
        ? Effect.logInfo(line, attributes)
        : Effect.logWarning(line, attributes),
    ),
  );
};
