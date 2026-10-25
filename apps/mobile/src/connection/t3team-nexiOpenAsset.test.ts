import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  message: vi.fn(() => "No app can show this."),
}));
vi.mock("../lib/attachmentDownload", () => ({
  openAttachmentInViewer: mocks.viewer,
  nativeViewerErrorMessage: mocks.message,
}));

import { clearLoopbackPorts, registerLoopbackPort } from "./t3team-nexiLoopbackFetch";
import { openAssetUrl } from "./t3team-nexiOpenAsset";

const attachment = { name: "report.pdf", mimeType: "application/pdf" };

describe("opening an asset outside the app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLoopbackPorts();
    registerLoopbackPort(4100);
    mocks.viewer.mockResolvedValue(undefined);
  });

  it("downloads a tunnel URL and opens the local copy instead of handing the URL to another app", async () => {
    const open = vi.fn();
    const url = "http://127.0.0.1:4100/api/assets/signed/report.pdf";
    await openAssetUrl({ url, attachment, open, report: vi.fn() });
    expect(open).not.toHaveBeenCalled();
    expect(mocks.viewer).toHaveBeenCalledWith(expect.objectContaining({ uri: url, attachment }));
  });

  it("keeps handing other URLs to the opener", async () => {
    const open = vi.fn();
    await openAssetUrl({
      url: "https://host.example/api/assets/t/f.pdf",
      attachment,
      open,
      report: vi.fn(),
    });
    expect(open).toHaveBeenCalledExactlyOnceWith("https://host.example/api/assets/t/f.pdf");
    expect(mocks.viewer).not.toHaveBeenCalled();
  });

  it("tells the user when the viewer fails, without throwing", async () => {
    const report = vi.fn();
    mocks.viewer.mockRejectedValue(new Error("ActivityNotFound"));
    await openAssetUrl({
      url: "http://127.0.0.1:4100/api/assets/signed/report.pdf",
      attachment,
      open: vi.fn(),
      report,
    });
    expect(report).toHaveBeenCalledExactlyOnceWith("No app can show this.");
  });
});
