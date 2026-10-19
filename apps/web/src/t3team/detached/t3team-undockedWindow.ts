/**
 * Whether this page is an undocked view (`@t3tools/shared/t3team-detachedView`): a window or tab
 * the detached page handed over to a whole route, which then runs without the app's navigation
 * chrome and without the once-per-app coordinators the main window runs.
 *
 * Kept in sessionStorage, which belongs to this one window or tab: it outlives a reload, a crash
 * reload and every in-window navigation, and is never seen by the main window. A page that cannot
 * read storage still keeps the mark for its own lifetime.
 */
const UNDOCKED_WINDOW_STORAGE_KEY = "t3team:undocked-window";

let undocked: boolean | null = null;

function readStoredMark(): boolean {
  try {
    return window.sessionStorage.getItem(UNDOCKED_WINDOW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isUndockedWindow(): boolean {
  if (typeof window === "undefined") return false;
  undocked ??= readStoredMark();
  return undocked;
}

/** Marks this page as an undocked view, for the rest of its life. */
export function markUndockedWindow(): void {
  undocked = true;
  try {
    window.sessionStorage.setItem(UNDOCKED_WINDOW_STORAGE_KEY, "1");
  } catch {
    // Storage blocked: the mark lasts until this page reloads, which is all it can.
  }
}
