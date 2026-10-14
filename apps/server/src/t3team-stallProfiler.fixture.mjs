// Run by t3team-stallProfiler.test.ts in a child process: the profiler connects to the process's
// MAIN thread, so it cannot be exercised from inside a test-runner worker.
import { startStallProfiler } from "./t3team-stallProfiler.ts";

const directory = process.argv[2];
let reported;
const profiler = startStallProfiler({
  directory,
  stallMs: 300,
  profileIntervalUs: 1_000,
  onStall: (event) => {
    reported = event;
  },
  onUnavailable: (reason) => {
    console.error(`unavailable: ${reason}`);
    process.exit(3);
  },
});

await new Promise((resolve) => setTimeout(resolve, 1_500));

function spinInsideTheBlockedCall() {
  const end = Date.now() + 1_500;
  let value = 0;
  while (Date.now() < end) value += Math.sqrt(value + 1);
  return value;
}
spinInsideTheBlockedCall();

await new Promise((resolve) => setTimeout(resolve, 2_500));
profiler.stop();
console.log(JSON.stringify({ reported }));
process.exit(0);
