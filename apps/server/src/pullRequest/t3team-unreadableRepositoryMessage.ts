const MAX_REASON_LENGTH = 240;

function singleLine(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= MAX_REASON_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

function asSentence(text: string): string {
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

/**
 * What a listing tells the reader about a repository it could not read: which repository on
 * which host, and why. The host matters because one project can carry repositories on several
 * (its own remote on github.com, a linked repository on a GitHub Enterprise host), and the
 * reason is what the host's provider said, which already names the fix when there is one.
 */
export function unreadableRepositoryMessage(input: {
  readonly repository: string;
  readonly host: string;
  readonly reason: string | null;
}): string {
  const subject = `${input.repository} on ${input.host} could not be read`;
  const reason = input.reason === null ? "" : singleLine(input.reason);
  return reason === "" ? `${subject}.` : `${subject}: ${asSentence(reason)}`;
}
