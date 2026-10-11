/**
 * The prompt the mounted chat should send for a local kickoff thread.
 *
 * `kickoffPending: false` means another sender already owns the launch (the dashboard sidecar).
 * Leaving it unset stores as pending, and this handoff is what puts the prompt on the thread.
 */
export function embeddedKickoffInitialUserMessage(thread: {
  readonly kickoffPending?: boolean;
  readonly kickoffMessage?: string;
}): string | undefined {
  return thread.kickoffPending && thread.kickoffMessage !== undefined
    ? thread.kickoffMessage
    : undefined;
}
