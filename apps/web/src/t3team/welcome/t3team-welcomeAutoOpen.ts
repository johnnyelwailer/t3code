let opened = false;

/** Module state, not component state: the gate unmounts while /welcome is showing. */
export function hasWelcomeAutoOpened(): boolean {
  return opened;
}

export function markWelcomeAutoOpened(): void {
  opened = true;
}
