/** Per-viewer update notice memory. Storage can be blocked; a miss only shows a notice again. */
export const readKey = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeKey = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
};
