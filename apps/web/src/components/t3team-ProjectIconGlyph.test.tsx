import type { ReactElement } from "react";
import { describe, expect, it } from "vite-plus/test";
import { ProjectIconGlyph } from "./t3team-ProjectIconGlyph";

describe("ProjectIconGlyph", () => {
  it("renders a Lucide icon name in its color", () => {
    const element = ProjectIconGlyph({
      icon: { kind: "lucide", name: "alarm-clock", color: "violet" },
    }) as ReactElement<{
      readonly className: string;
      readonly children: ReactElement<{
        readonly children: ReactElement<{ readonly name: string; readonly className: string }>;
      }>;
    }>;

    expect(element.props.className).toContain("text-violet-600");
    expect(element.props.children.props.children.props.name).toBe("alarm-clock");
    expect(element.props.children.props.children.props.className).toContain("text-violet-600");
  });

  it("renders an emoji as its glyph", () => {
    const element = ProjectIconGlyph({
      icon: { kind: "emoji", emoji: "🦄" },
    }) as ReactElement<{ readonly children: ReactElement<{ readonly children: string }> }>;

    expect(element.props.children.props.children).toBe("🦄");
  });
});
