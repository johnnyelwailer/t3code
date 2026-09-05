/**
 * Shared collapse thresholds and fade-mask styling for long chat messages.
 *
 * Originally defined inline in `MessagesTimeline.tsx` for user messages only
 * (`CollapsibleUserMessageBody` / `shouldCollapseUserMessage`). Extracted here so
 * `T3TeamSystemTimelineNotificationBody` (workflow-authored `thread.notifyUser` reports) reuses the
 * exact same numbers and visual treatment instead of re-deriving them — see
 * `t3team-SystemTimelineNotificationBody.tsx`.
 */
export const COLLAPSED_MESSAGE_MAX_LINES = 8;
export const COLLAPSED_MESSAGE_MAX_LENGTH = 600;
export const COLLAPSED_MESSAGE_FADE_HEIGHT_REM = 1.75;
export const COLLAPSED_MESSAGE_FADE_MASK = `linear-gradient(to bottom, black calc(100% - ${COLLAPSED_MESSAGE_FADE_HEIGHT_REM}rem), transparent)`;

/** True when `text` is long enough (by character count or line count) to warrant collapsing. */
export function shouldCollapseMessageText(text: string): boolean {
  if (text.trim().length === 0) {
    return false;
  }

  return (
    text.length > COLLAPSED_MESSAGE_MAX_LENGTH ||
    text.split("\n").length > COLLAPSED_MESSAGE_MAX_LINES
  );
}
