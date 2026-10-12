import { memo, useMemo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { citationNumber, remarkCitations } from "../utils/citations";

interface MarkdownProps {
  content: string;
  /** Number of sources returned with an answer. Enables citation markers. */
  sourceCount?: number;
  onCitationClick?: (sourceNumber: number) => void;
}

/**
 * Renders model output and extracted PDF text, both of which are untrusted.
 * react-markdown builds React elements and never injects HTML; raw HTML in
 * the text is dropped, and images are not rendered so that content cannot
 * make the browser request arbitrary URLs.
 */
export const Markdown = memo(function Markdown({
  content,
  sourceCount = 0,
  onCitationClick,
}: MarkdownProps) {
  const remarkPlugins = useMemo<Options["remarkPlugins"]>(
    () => [remarkGfm, [remarkCitations, { sourceCount }]],
    [sourceCount],
  );

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const number = citationNumber(href);
        if (number !== null) {
          return (
            <button
              type="button"
              className="citation"
              aria-label={`Show source ${number}`}
              onClick={() => onCitationClick?.(number)}
            >
              {number}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
      table({ children }) {
        return (
          <div className="table-scroll">
            <table>{children}</table>
          </div>
        );
      },
    }),
    [onCitationClick],
  );

  return (
    <div className="prose-kb">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={components}
        disallowedElements={["img"]}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
