/**
 * The link and image policy of `pack-ui` `Markdown`, as the last remark pass. Pack text is data an
 * agent can write, so a link may only leave for the web or mail, and an image may only be one the
 * text carries inline: rendering never opens a local file, a host-only route, or fetches a URL a
 * model chose. Everything else keeps its words and loses its target.
 */
interface MdNode {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  value?: string;
  children?: MdNode[];
}

const SAFE_LINK = /^(?:https?:|mailto:|#)/i;
const SAFE_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,/i;

export const isSafePackLinkUrl = (url: string): boolean => SAFE_LINK.test(url.trim());

const imageText = (node: MdNode): MdNode => ({
  type: "text",
  value: node.alt ? `[${node.alt}]` : "",
});

function collectDefinitions(node: MdNode, into: Map<string, string>): Map<string, string> {
  if (node.type === "definition" && node.identifier) into.set(node.identifier, node.url ?? "");
  for (const child of node.children ?? []) collectDefinitions(child, into);
  return into;
}

/** The node to keep in place of `node`: itself, or the text it stands for. */
function policed(node: MdNode, definitions: ReadonlyMap<string, string>): MdNode[] {
  const target =
    node.type === "linkReference" || node.type === "imageReference"
      ? (definitions.get(node.identifier ?? "") ?? "")
      : (node.url ?? "");
  switch (node.type) {
    case "link":
    case "linkReference":
      return isSafePackLinkUrl(target) ? [node] : (node.children ?? []);
    case "image":
    case "imageReference":
      return SAFE_IMAGE.test(target.trim()) ? [node] : [imageText(node)];
    case "definition":
      // A reference renders through its definition; an unsafe one's references are text above.
      return isSafePackLinkUrl(target) || SAFE_IMAGE.test(target.trim()) ? [node] : [];
    default:
      return [node];
  }
}

export function remarkPackSafeUrls() {
  return (tree: MdNode) => {
    const definitions = collectDefinitions(tree, new Map());
    const visit = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => policed(child, definitions));
      for (const child of node.children) visit(child);
    };
    visit(tree);
  };
}
