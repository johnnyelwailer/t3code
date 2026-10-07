interface MarkdownNode {
  type: string;
  url?: string;
  alt?: string | null;
  value?: string;
  children?: MarkdownNode[] | undefined;
}

const SAFE_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,/;

/**
 * A remark plugin for model-written markdown: an image the explainer did not inline becomes its
 * alt text, so rendering never makes the reader's browser fetch a URL a model chose. Link
 * references to images are dropped the same way. Raw HTML is handled by
 * `remarkExplainerInlineHtml`.
 */
export function remarkExplainerSafeImages() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      node.children = node.children?.map((child) => {
        const unsafe =
          child.type === "imageReference" ||
          (child.type === "image" && !SAFE_IMAGE.test(child.url ?? ""));
        if (unsafe) return { type: "text", value: child.alt ? `[${child.alt}]` : "" };
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}
