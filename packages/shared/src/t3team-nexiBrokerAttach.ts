/** What an attach asks for: a session, and the environment the client knows it by. */
export interface AttachTarget {
  readonly sessionId: string;
  readonly environmentId?: string | undefined;
}

/**
 * The listed session an attach reaches: the one asked for, else — a workspace's sessions share
 * their environment, since the snapshot keeps its id — the live one serving the same environment.
 */
export function sessionToAttach<
  S extends { readonly runId: string; readonly environmentId?: string | null | undefined },
>(sessions: readonly S[], input: AttachTarget): S | undefined {
  const asked = sessions.find(
    (s) =>
      s.runId === input.sessionId &&
      s.environmentId &&
      (input.environmentId === undefined || s.environmentId === input.environmentId),
  );
  if (asked !== undefined || input.environmentId === undefined) return asked;
  // Two live sessions in one workspace (started side by side) serve the same environment: the
  // newest run wins, so reconnects stay on one machine instead of following list order.
  return sessions
    .filter((s) => s.environmentId === input.environmentId)
    .reduce<S | undefined>(
      (newest, s) => (newest === undefined || Number(s.runId) > Number(newest.runId) ? s : newest),
      undefined,
    );
}
