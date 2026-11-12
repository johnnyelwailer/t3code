/**
 * Display wording for a parked or failed queued send. A persisted failureMessage
 * may still carry the retired "#683" promise to "start a plain session" even when
 * that action is not on offer (the menu only includes it when projectId is
 * defined). Strip that clause so the card never promises a way out it does not
 * have.
 */

const PLAIN_SESSION_PROMISE = /start a plain session/i;

export function displayCloudQueuedFailureMessage(
  message: string,
  recoveryActions: ReadonlyArray<{ readonly id: string }>,
): string {
  if (!PLAIN_SESSION_PROMISE.test(message)) return message;
  if (recoveryActions.some((action) => action.id === "plain-session")) return message;
  return tidyFailureMessage(
    message.replace(/,?\s*start a plain session(?:\s*,\s*or\s*|\s+or\s*|,?\s*)/i, ", or "),
  );
}

function tidyFailureMessage(message: string): string {
  return message
    .replace(/\s+or\s+or\s+/gi, " or ")
    .replace(/,\s*,+/g, ",")
    .replace(/,\s+or\s+or\s+/gi, ", or ")
    .replace(/:\s*,/g, ": ")
    .replace(/,\s+or\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim()
    .replace(/[ ,]+$/g, "")
    .replace(/,\s*or$/i, "")
    .trim();
}
