// capability-gating fixture: this workflow does NOT declare "thread" in meta.capabilities,
// so `thread.send` is bound to a thrower — calling it raises PermissionDeniedError at the
// call site (the first real exercise of the capability list).
export const meta = {
  name: "fixtures.thread-send-denied",
  description: "Calls thread.send without declaring the 'thread' capability.",
} as const;

await thread.send("self", { kind: "log", text: "checkpoint" });

return { ok: true };
