// @effect-diagnostics nodeBuiltinImport:off - the boot script is inline HTML, read from disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const indexHtml = NodeFS.readFileSync(
  NodePath.resolve(import.meta.dirname, "../../index.html"),
  "utf8",
);
const brandScript = (() => {
  const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const script = scripts.find((candidate) => candidate?.includes("/.well-known/t3/environment"));
  if (!script) throw new Error("Could not find the pack brand boot script in index.html");
  return script;
})();

type FakeElement = {
  attributes: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | undefined;
  src: string;
  alt: string;
};

function fakeElement(attributes: Record<string, string>): FakeElement {
  const element: FakeElement = {
    attributes: { ...attributes },
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === "src") this.src = value;
      if (name === "alt") this.alt = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    src: attributes.src ?? "",
    alt: attributes.alt ?? "",
  };
  return element;
}

async function runBrandScript(body: unknown) {
  const card = fakeElement({ "aria-label": "T3 Code splash screen" });
  const logo = fakeElement({ alt: "T3 Code", src: "/apple-touch-icon.png" });
  const elements = new Map<string, FakeElement>([
    ["boot-shell-card", card],
    ["boot-shell-logo", logo],
  ]);
  const documentElement = { dataset: {} as Record<string, string> };
  let title = "T3 Code (Alpha)";
  const fakeDocument = {
    get title() {
      return title;
    },
    set title(value: string) {
      title = value;
    },
    documentElement,
    getElementById: (id: string) => elements.get(id) ?? null,
  };
  const fetchImpl = () =>
    Promise.resolve({
      ok: body !== null,
      json: () => Promise.resolve(body),
    });
  const expression = brandScript.trim().replace(/;\s*$/, "");
  await new Function("document", "fetch", `return ${expression}`)(fakeDocument, fetchImpl);
  return { title, documentElement, card, logo };
}

describe("index.html pack brand boot script", () => {
  it("keeps the vendor splash when the descriptor has no appearance", async () => {
    const boot = await runBrandScript(null);
    expect(boot.title).toBe("T3 Code (Alpha)");
    expect(boot.logo.alt).toBe("T3 Code");
    expect(boot.documentElement.dataset.t3teamBootAppName).toBeUndefined();
  });

  it("applies labels.appName and the brand mark from the pack descriptor", async () => {
    const mark = "data:image/svg+xml;base64,QUJD";
    const boot = await runBrandScript({
      appearance: {
        labels: { appName: "Pack Label" },
        productName: "Pack Product",
        brand: { mark },
      },
    });
    expect(boot.title).toBe("Pack Label (Alpha)");
    expect(boot.documentElement.dataset.t3teamBootAppName).toBe("Pack Label");
    expect(boot.card.attributes["aria-label"]).toBe("Pack Label splash screen");
    expect(boot.logo.alt).toBe("Pack Label");
    expect(boot.logo.src).toBe(mark);
  });
});
