let recorderOpen = false;

/** Set by the settings shortcut recorder while it waits for a chord, so global chords are not acted on. */
export const setShortcutRecorderOpen = (open: boolean): void => {
  recorderOpen = open;
};

export const isShortcutRecorderOpen = (): boolean => recorderOpen;
