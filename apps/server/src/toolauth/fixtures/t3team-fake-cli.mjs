// A stand-in CLI with the same three-beat shape as `claude` and `codex login`.
//
// Exists so the state machine can be exercised end-to-end without triggering
// anyone's real OAuth. Prints a URL, waits for a code on stdin, accepts "GOOD".
//
// Ported from prototypes/hosted-sandbox/lib/toolauth/fixtures/fake-cli.mjs.
// Not used by ToolAuthService's unit tests (those drive a stubbed PtyAdapter
// directly, with no real process) -- kept for manual/local exercising of the
// full pty path with the `fake` adapter.

const URL = "https://example.invalid/device/AbC123";

console.log("Opening browser for sign-in...");
console.log(`If it does not open, visit: ${URL}`);
setTimeout(() => {
  console.log("Paste code here if prompted:");
}, 20);

let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString();
  if (!buf.includes("\n")) return;
  const code = buf.trim();
  if (code === "GOOD") {
    console.log("Login successful");
    process.exit(0);
  }
  console.log("Login failed: invalid code");
  process.exit(1);
});
