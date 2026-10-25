import * as NodeModule from "node:module";
import { describe, expect, it } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
const withNexiBrokerOrigin = require("./t3team-withNexiBrokerOrigin.cjs");
const { BROKER_ORIGIN_KEY } = withNexiBrokerOrigin;

async function apply(origin, manifestApplication) {
  const config = withNexiBrokerOrigin({ name: "x", slug: "x" }, { origin });
  const mod = config.mods.android.manifest;
  const result = await mod({
    ...config,
    modRequest: {},
    modResults: { manifest: { application: [manifestApplication] } },
  });
  return result.modResults.manifest.application[0];
}

describe("withNexiBrokerOrigin", () => {
  it("writes the broker origin (no path) as application meta-data", async () => {
    const application = await apply("https://broker.test/v1/", { $: {} });
    expect(application["meta-data"]).toEqual([
      { $: { "android:name": BROKER_ORIGIN_KEY, "android:value": "https://broker.test" } },
    ]);
  });
  it("replaces an earlier value and keeps other meta-data", async () => {
    const application = await apply("https://b.test", {
      "meta-data": [
        { $: { "android:name": BROKER_ORIGIN_KEY, "android:value": "https://old.test" } },
        { $: { "android:name": "other", "android:value": "1" } },
      ],
    });
    expect(application["meta-data"].map((entry) => entry.$["android:value"])).toEqual([
      "1",
      "https://b.test",
    ]);
  });
  it.each(["http://broker.test", "not a url", undefined])("refuses %s", (origin) => {
    expect(() => withNexiBrokerOrigin({ name: "x", slug: "x" }, { origin })).toThrow();
  });
});
