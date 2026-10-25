import { beforeEach, describe, expect, it } from "vite-plus/test";
import { deviceStreamBaseUrl } from "../features/devices/device-stream-document";
import { clearLoopbackPorts, registerLoopbackPort } from "./t3team-nexiLoopbackFetch";
import { previewDocumentBaseUrl } from "./t3team-nexiLoopbackOrigin";

describe("WebView documents over the broker loopback", () => {
  beforeEach(() => {
    clearLoopbackPorts();
    registerLoopbackPort(4100);
  });

  it("loads an Android viewer's device document from the tunnel origin so it is same-origin and sends the cookie", () => {
    // https://localhost/ would make every request to the loopback cross-origin: no cookie, denied.
    expect(deviceStreamBaseUrl("android", "android", "http://127.0.0.1:4100/hub")).toBe(
      "http://127.0.0.1:4100/",
    );
    expect(deviceStreamBaseUrl("android", "ios", "http://127.0.0.1:4100/hub")).toBe(
      "http://127.0.0.1:4100/",
    );
  });

  it("keeps the synthetic secure origin for hosts that are not a live tunnel, and file:/// off Android", () => {
    expect(deviceStreamBaseUrl("android", "android", "https://host.example/hub")).toBe(
      "https://localhost/",
    );
    expect(deviceStreamBaseUrl("android", "android", "http://127.0.0.1:4999/hub")).toBe(
      "https://localhost/",
    );
    expect(deviceStreamBaseUrl("ios", "android", "http://127.0.0.1:4100/hub")).toBe("file:///");
  });

  it("gives the browser preview document the same treatment, reading access from its configuration", () => {
    const configuration = JSON.stringify({ access: { httpBase: "http://127.0.0.1:4100/hub" } });
    expect(previewDocumentBaseUrl(configuration, "https://localhost/")).toBe(
      "http://127.0.0.1:4100/",
    );
    const remote = JSON.stringify({ access: { httpBase: "https://host.example/hub" } });
    expect(previewDocumentBaseUrl(remote, "https://localhost/")).toBe("https://localhost/");
    expect(previewDocumentBaseUrl("not json", "https://localhost/")).toBe("https://localhost/");
    expect(previewDocumentBaseUrl("{}", "https://localhost/")).toBe("https://localhost/");
  });
});
