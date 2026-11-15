import type { ReactNode } from "react";
import type { DocxBlock, DocxInline, DocxWarning } from "./docxAdapter";
import type { ReaderLink } from "./storage";
import { linksForBlock } from "./docxAnalysis";

type Segment =
  | {
      kind: "text";
      text: string;
      bold: boolean;
      italic: boolean;
      link?: ReaderLink;
    }
  | { kind: "formula"; text: string; link?: ReaderLink }
  | { kind: "image"; src: string; alt: string; link?: ReaderLink };

function segmentsFor(
  nodes: DocxInline[],
  links: ReaderLink[],
): Segment[] {
  const segments: Segment[] = [];
  let offset = 0;
  for (const node of nodes) {
    if (node.type === "text") {
      let cursor = 0;
      while (cursor < node.text.length) {
        const absolute = offset + cursor;
        const link = links.find(
          (item) =>
            item.start !== undefined &&
            absolute >= item.start &&
            absolute < (item.end || 0),
        );
        let end = node.text.length;
        if (link) {
          end = Math.min(node.text.length, (link.end || 0) - offset);
        } else {
          const next = links
            .map((item) => item.start || 0)
            .filter((start) => start > absolute)
            .sort((a, b) => a - b)[0];
          if (next !== undefined) end = Math.min(node.text.length, next - offset);
        }
        if (end <= cursor) end = node.text.length;
        segments.push({
          kind: "text",
          text: node.text.slice(cursor, end),
          bold: node.bold,
          italic: node.italic,
          link,
        });
        cursor = end;
      }
      offset += node.text.length;
    } else if (node.type === "formula") {
      const link = links.find(
        (item) =>
          item.start !== undefined &&
          offset >= item.start &&
          offset < (item.end || 0),
      );
      segments.push({ kind: "formula", text: node.text, link });
      offset += node.text.length;
    } else if (node.src) {
      segments.push({ kind: "image", src: node.src, alt: node.alt });
    } else {
      segments.push({ kind: "text", text: "[图片未能提取]", bold: false, italic: true });
    }
  }
  return segments;
}

function segmentContent(segment: Segment): ReactNode {
  if (segment.kind === "formula")
    return (
      <span className="docx-formula" title="Word 公式，已转为线性文本显示">
        {segment.text}
      </span>
    );
  if (segment.kind === "image")
    return (
      <img className="docx-image" src={segment.src} alt={segment.alt} loading="lazy" />
    );
  let content: ReactNode = segment.text;
  if (segment.bold) content = <strong>{content}</strong>;
  if (segment.italic) content = <em>{content}</em>;
  return content;
}

function renderSegments(
  segments: Segment[],
  onOpen: (link: ReaderLink) => void,
): ReactNode[] {
  const result: ReactNode[] = [];
  let index = 0;
  while (index < segments.length) {
    const segment = segments[index];
    if (!segment.link) {
      result.push(
        <span className="docx-segment" key={index}>
          {segmentContent(segment)}
        </span>,
      );
      index += 1;
      continue;
    }
    const group = [segment];
    let next = index + 1;
    while (
      next < segments.length &&
      segments[next].link?.id === segment.link.id
    ) {
      group.push(segments[next]);
      next += 1;
    }
    result.push(
      <button
        className="docx-mention"
        data-docx-link={segment.link.id}
        onClick={() => onOpen(segment.link!)}
        title={segment.link.description}
        key={`link-${segment.link.id}-${index}`}
      >
        {group.map((item, itemIndex) => (
          <span className="docx-segment" key={itemIndex}>
            {segmentContent(item)}
          </span>
        ))}
      </button>,
    );
    index = next;
  }
  return result;
}

function inlines(
  nodes: DocxInline[] = [],
  links: ReaderLink[],
  onOpen: (link: ReaderLink) => void,
): ReactNode[] {
  return renderSegments(segmentsFor(nodes, links), onOpen);
}

export function DocxDocument({
  blocks,
  links,
  warnings,
  onOpenLink,
}: {
  blocks: DocxBlock[];
  links: ReaderLink[];
  warnings: DocxWarning[];
  onOpenLink: (link: ReaderLink) => void;
}) {
  return (
    <article className="docx-document">
      {blocks.map((block) => {
        const blockLinks = linksForBlock(links, block.blockId);
        const blockWarnings = warnings.filter(
          (warning) => warning.blockId === block.blockId,
        );
        const body = (
          <>
            {block.type === "table" ? (
              <div className="docx-table-wrap">
                <table className="docx-table">
                  <tbody>
                    {block.rows?.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              inlines(block.inlines, blockLinks, onOpenLink)
            )}
            {blockWarnings.map((warning) => (
              <span className={`docx-warning ${warning.kind}`} key={warning.message}>
                {warning.message}
              </span>
            ))}
          </>
        );
        const common = {
          "data-block-id": block.blockId,
          id: `docx-${block.blockId}`,
        };
        if (block.type === "heading")
          return block.level === 1 ? (
            <h2 className="docx-heading h2" key={block.blockId} {...common}>
              {body}
            </h2>
          ) : (
            <h3 className="docx-heading h3" key={block.blockId} {...common}>
              {body}
            </h3>
          );
        if (block.type === "list")
          return (
            <div className="docx-list-item" key={block.blockId} {...common}>
              <span className="docx-bullet">•</span>
              <p>{body}</p>
            </div>
          );
        return (
          <p className="docx-paragraph" key={block.blockId} {...common}>
            {body}
          </p>
        );
      })}
    </article>
  );
}
