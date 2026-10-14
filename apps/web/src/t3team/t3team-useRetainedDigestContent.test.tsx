// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { useRetainedDigestContent } from "~/t3team/t3team-useRetainedDigestContent";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function Probe(props: { current: string; hasContent: boolean; notAnAnswerYet: boolean }) {
  return <p>{useRetainedDigestContent(props.current, props.hasContent, props.notAnAnswerYet)}</p>;
}

describe("useRetainedDigestContent", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (current: string, hasContent: boolean, notAnAnswerYet: boolean) =>
    act(() => {
      root.render(
        <Probe current={current} hasContent={hasContent} notAnAnswerYet={notAnAnswerYet} />,
      );
    });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the last content while an empty result is not an answer yet", () => {
    render("six tickets", true, false);
    render("nothing", false, true);

    expect(container.textContent).toBe("six tickets");
  });

  it("lets an empty result through once it can be believed", () => {
    render("six tickets", true, false);
    render("nothing", false, true);
    render("nothing", false, false);

    expect(container.textContent).toBe("nothing");
  });

  it("follows new content as it arrives", () => {
    render("six tickets", true, false);
    render("seven tickets", true, true);

    expect(container.textContent).toBe("seven tickets");
  });

  it("has nothing to keep before any content was shown", () => {
    render("nothing", false, true);

    expect(container.textContent).toBe("nothing");
  });
});
