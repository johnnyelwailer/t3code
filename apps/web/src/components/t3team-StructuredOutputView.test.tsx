// @vitest-environment jsdom
/**
 * StructuredOutputView — the generic result/error renderer: JSON input becomes a
 * structured key/value view (status badge, local-time timestamps, no raw JSON);
 * non-JSON input falls back to the raw string unchanged.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { StructuredOutputView } from "./t3team-StructuredOutputView";

const RESERVED_JSON =
  '{"message":"GPU is reserved for about 8 minutes by jb (reason: GSI AssistMe AI – lokale Entwicklung).","type":"reservation_error","code":"gpu_reserved","author":"jb","purpose":"GSI AssistMe AI – lokale Entwicklung","retry_after_seconds":5,"starts_at":"2026-09-16T07:09:00Z","ends_at":"2026-09-16T07:21:42Z","status":"reserved","model":"qwen3.8","reserved_at":"2026-09-16T07:09:00Z"}';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(element);
  });
  return container!;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("StructuredOutputView", () => {
  it("renders a status-prefixed JSON error as structured fields, not the raw blob", () => {
    const el = render(<StructuredOutputView raw={`423: ${RESERVED_JSON}`} />);
    const text = el.textContent ?? "";
    expect(text).toContain("423");
    expect(text).toContain("author");
    expect(text).toContain("jb");
    // The ISO instant is converted to local time, never shown raw.
    expect(text).not.toContain("07:21:42Z");
    // The raw JSON object is gone.
    expect(text).not.toContain('{"message"');
    expect(text).not.toContain('"code"');
  });

  it("shows the top-level field count in compact mode", () => {
    const el = render(<StructuredOutputView raw={`423: ${RESERVED_JSON}`} compact />);
    const text = el.textContent ?? "";
    expect(text).toContain("423");
    expect(text).toMatch(/fields/);
    // Compact mode must not dump the individual field values.
    expect(text).not.toContain("jb");
  });

  it("falls back to the raw string for non-JSON input", () => {
    const el = render(<StructuredOutputView raw="Claude gave up after repeated API errors." />);
    expect(el.textContent).toBe("Claude gave up after repeated API errors.");
  });
});
