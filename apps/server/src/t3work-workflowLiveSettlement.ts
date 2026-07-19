export function createWorkflowLiveSettlement(input: {
  readonly beforeResolve: () => Promise<void>;
  readonly resolve: (reply: unknown) => void;
}) {
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    completed,
    resolve: async (reply: unknown) => {
      await input.beforeResolve();
      input.resolve(reply);
      finish();
    },
  };
}
