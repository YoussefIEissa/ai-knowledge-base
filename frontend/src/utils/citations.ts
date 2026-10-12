// Turns the "[Source N]" markers the backend's prompt asks the model to
// write into links that the answer view renders as citation buttons.
//
// The mapping is reliable because the backend numbers the passages in the
// prompt in the same order it returns them in `sources`: "[Source N]" is
// sources[N - 1]. A marker is linked only when every number in it is within
// range; anything else is left as plain text rather than guessed at.

export const CITATION_HREF_PREFIX = "#kb-source-";

/** Matches "[Source 1]", "[Sources 1, 2]", "[Source 1 and Source 3]" and similar. */
const CITATION_PATTERN =
  /\[(Sources?\s*\d+(?:\s*(?:,|;|&|and)\s*(?:Sources?\s*)?\d+)*)\]/gi;

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

function splitText(value: string, sourceCount: number): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(CITATION_PATTERN)) {
    const numbers = (match[1]?.match(/\d+/g) ?? []).map(Number);
    const allInRange =
      numbers.length > 0 && numbers.every((number) => number >= 1 && number <= sourceCount);
    if (!allInRange) continue;

    if (match.index > cursor) nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    for (const number of numbers) {
      nodes.push({
        type: "link",
        url: `${CITATION_HREF_PREFIX}${number}`,
        children: [{ type: "text", value: String(number) }],
      });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return [{ type: "text", value }];
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

function transform(node: MarkdownNode, sourceCount: number): void {
  // Text inside code is a different node type, and existing links are skipped.
  if (!node.children || node.type === "link" || node.type === "linkReference") return;

  const next: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitText(child.value, sourceCount));
    } else {
      transform(child, sourceCount);
      next.push(child);
    }
  }
  node.children = next;
}

/** remark plugin. `sourceCount` is the number of sources returned with the answer. */
export function remarkCitations(options: { sourceCount: number }) {
  return (tree: MarkdownNode): void => {
    if (options.sourceCount > 0) transform(tree, options.sourceCount);
  };
}

/** Source number from a citation link, or null for an ordinary link. */
export function citationNumber(href: string | undefined): number | null {
  if (!href?.startsWith(CITATION_HREF_PREFIX)) return null;
  const number = Number(href.slice(CITATION_HREF_PREFIX.length));
  return Number.isInteger(number) && number > 0 ? number : null;
}
