// Run by t3team-livenessBeacon.test.ts in a child process: it blocks its own event loop, which a
// test-runner worker must not do, while the beacon writes to fd 3.
import { startLivenessBeacon } from "./t3team-livenessBeacon.ts";

const beacon = startLivenessBeacon({
  fd: 3,
  intervalMs: 100,
  onUnavailable: (reason) => {
    console.error(`unavailable: ${reason}`);
    process.exit(3);
  },
});

await new Promise((resolve) => setTimeout(resolve, 500));

const end = Date.now() + 1_500;
let value = 0;
while (Date.now() < end) value += Math.sqrt(value + 1);

await new Promise((resolve) => setTimeout(resolve, 500));
beacon.stop();
process.exit(0);
