/**
 * Runs transcription passes one after another, because a whisper worker does one at a time and a
 * second request would only queue inside it. A pass starts at once when nothing is running.
 * `busy` lets a caller skip optional work (a partial) instead of queueing it ahead of a pass that
 * matters (an utterance's final); it clears before the finished pass's own continuations run.
 */
export function createPassChain() {
  let tail: Promise<unknown> = Promise.resolve();
  let running = 0;
  const finished = () => {
    running -= 1;
  };

  return {
    get busy(): boolean {
      return running > 0;
    },
    run<T>(pass: () => Promise<T>): Promise<T> {
      running += 1;
      const result = running === 1 ? new Promise<T>((resolve) => resolve(pass())) : tail.then(pass);
      result.then(finished, finished);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    /** Resolves once every pass started so far has finished. */
    idle(): Promise<void> {
      return tail.then(() => undefined);
    },
  };
}
