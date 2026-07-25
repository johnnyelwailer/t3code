export function createWorkflowLiveSettlement(input: {
  readonly beforeResolve: () => Promise<void>;
  readonly resolve: (reply: unknown) => void;
}) {
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let settling: Promise<void> | undefined;
  return {
    completed,
    resolve: (reply: unknown) => {
      if (settling !== undefined) return settling;
      settling = (async () => {
        await input.beforeResolve();
        input.resolve(reply);
        finish();
      })();
      return settling;
    },
  };
}
