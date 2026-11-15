import JSZip from "jszip";

export type DocxInline =
  | { type: "text"; text: string; bold: boolean; italic: boolean }
  | { type: "formula"; text: string }
  | { type: "image"; src: string; alt: string };

export type DocxWarning = {
  blockId: string;
  kind: "formula" | "image" | "unsupported" | "parse";
  message: string;
};

export type DocxBlock = {
  blockId: string;
  sectionId: string;
  sectionTitle: string;
  type: "heading" | "paragraph" | "list" | "table";
  level?: number;
  inlines?: DocxInline[];
  text: string;
  rows?: string[][];
  ordered?: boolean;
};

export type ParsedDocument = {
  docId: string;
  fingerprint: string;
  fileName: string;
  format: "docx";
  parserVersion: string;
  title: string;
  blocks: DocxBlock[];
  warnings: DocxWarning[];
  formulaCount: number;
  imageCount: number;
};

const PARSER_VERSION = "docx-v1";
const MAX_UNCOMPRESSED = 120 * 1024 * 1024;

function xml(text: string): XMLDocument {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("Word 文档的内部 XML 损坏，无法解析");
  return document;
}

function tag(element: Element, name: string): Element[] {
  return Array.from(element.getElementsByTagNameNS("*", name));
}

function first(element: Element, name: string): Element | null {
  return element.getElementsByTagNameNS("*", name)[0] || null;
}

function attr(element: Element | null, name: string): string {
  if (!element) return "";
  const attribute = Array.from(element.attributes).find(
    (item) =>
      item.localName === name ||
      item.name === name ||
      item.name === `w:${name}` ||
      item.name === `r:${name}`,
  );
  return attribute?.value || "";
}

function ommlText(element: Element): string {
  const children = Array.from(element.children);
  const byLocal = (name: string) =>
    children.find((child) => child.localName === name);
  const local = element.localName;
  if (local === "f") {
    const numerator = byLocal("num");
    const denominator = byLocal("den");
    return `(${numerator ? inlineChildren(numerator) : ""})/(${
      denominator ? inlineChildren(denominator) : ""
    })`;
  }
  if (local === "sSup") {
    return `${byLocal("e") ? inlineChildren(byLocal("e")!) : ""}^{${
      byLocal("sup") ? inlineChildren(byLocal("sup")!) : ""
    }}`;
  }
  if (local === "sSub") {
    return `${byLocal("e") ? inlineChildren(byLocal("e")!) : ""}_{${
      byLocal("sub") ? inlineChildren(byLocal("sub")!) : ""
    }}`;
  }
  if (local === "rad") {
    return `√(${byLocal("e") ? inlineChildren(byLocal("e")!) : ""})`;
  }
  if (local === "d") {
    return `(${inlineChildren(element)})`;
  }
  if (local === "nary") {
    const chr = attr(byLocal("naryPr") || null, "chr") || "∫";
    const sub = byLocal("sub") ? inlineChildren(byLocal("sub")!) : "";
    const sup = byLocal("sup") ? inlineChildren(byLocal("sup")!) : "";
    return `${chr}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""} ${inlineChildren(
      element,
    )}`;
  }
  if (local === "t") return element.textContent || "";
  if (local === "r") return tag(element, "t").map((node) => node.textContent || "").join("");
  return children.map(ommlText).join("");
}

function inlineChildren(element: Element): string {
  return Array.from(element.children)
    .filter((child) => !["ctrlPr", "argPr"].includes(child.localName))
    .map(ommlText)
    .join("");
}

function styleInfo(paragraph: Element): {
  headingLevel: number;
  quote: boolean;
  list: boolean;
} {
  const style = attr(first(paragraph, "pStyle"), "val").toLowerCase();
  const outline = attr(first(paragraph, "outlineLvl"), "val");
  const list = Boolean(first(paragraph, "numPr"));
  let headingLevel = 0;
  if (outline !== "") headingLevel = Math.min(6, Math.max(1, Number(outline) + 1));
  else if (/heading\s*1|^title$/.test(style)) headingLevel = 1;
  else if (/heading\s*2/.test(style)) headingLevel = 2;
  else if (/heading\s*3/.test(style)) headingLevel = 3;
  return {
    headingLevel,
    quote: /quote|subtitle/.test(style),
    list,
  };
}

function imageData(
  files: JSZip | null,
  relationships: Map<string, string>,
  drawing: Element,
): string | null {
  if (!files) return null;
  const blip = first(drawing, "blip");
  const id = attr(blip, "embed");
  const target = relationships.get(id);
  if (!target || target.startsWith("http")) return null;
  const normalized = target.replace(/^\.\//, "").replace(/^word\//, "");
  const file = files.file(`word/${normalized}`);
  return file ? `@@DOCX_IMAGE:${normalized}@@` : null;
}

function paragraphInlines(
  paragraph: Element,
  files: JSZip | null,
  relationships: Map<string, string>,
): DocxInline[] {
  const inlines: DocxInline[] = [];
  const visit = (node: Element) => {
    const local = node.localName;
    if (local === "pPr" || local === "rPr" || local === "sectPr") return;
    if (local === "r") {
      const props = first(node, "rPr");
      const bold = Boolean(first(props || node, "b"));
      const italic = Boolean(first(props || node, "i"));
      for (const child of Array.from(node.children)) {
        if (child.localName === "t") {
          const text = child.textContent || "";
          if (text) inlines.push({ type: "text", text, bold, italic });
        } else if (child.localName === "br" || child.localName === "tab") {
          inlines.push({ type: "text", text: child.localName === "tab" ? "\t" : "\n", bold, italic });
        } else if (child.localName === "drawing") {
          const src = imageData(files, relationships, child);
          if (src) inlines.push({ type: "image", src, alt: "Word 图片" });
        }
      }
      return;
    }
    if (local === "oMath" || local === "oMathPara") {
      const text = inlineChildren(node).replace(/\s+/g, " ").trim();
      if (text) inlines.push({ type: "formula", text });
      return;
    }
    if (local === "drawing") {
      const src = imageData(files, relationships, node);
      if (src) inlines.push({ type: "image", src, alt: "Word 图片" });
      return;
    }
    if (local === "del" || local === "instrText") return;
    for (const child of Array.from(node.children)) visit(child);
  };
  for (const child of Array.from(paragraph.children)) visit(child);
  return inlines;
}

function inlineText(inlines: DocxInline[]): string {
  return inlines
    .map((inline) => (inline.type === "image" ? "" : inline.text))
    .join("");
}

function tableRows(table: Element): { rows: string[][]; text: string } {
  const rows = Array.from(table.children)
    .filter((child) => child.localName === "tr")
    .map((row) =>
      Array.from(row.children)
        .filter((child) => child.localName === "tc")
        .map((cell) =>
          Array.from(cell.getElementsByTagNameNS("*", "p"))
            .map((paragraph) => inlineText(paragraphInlines(paragraph, null, new Map())))
            .join(" "),
        ),
    );
  return { rows, text: rows.map((row) => row.join(" | ")).join("\n") };
}

async function fileDataUrl(file: JSZip.JSZipObject): Promise<string> {
  const bytes = await file.async("uint8array");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

export async function parseDocx(
  buffer: ArrayBuffer,
  docId: string,
  fingerprint: string,
  fileName: string,
): Promise<ParsedDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("无法打开这个 Word 文件；请确认它是有效的 .docx，而不是改了后缀的 .doc");
  }
  const documentFile = zip.file("word/document.xml");
  if (!documentFile)
    throw new Error("文件缺少 word/document.xml；可能是旧 .doc、加密文档或损坏文件");
  let total = 0;
  for (const file of Object.values(zip.files)) {
    if (!file.dir) total += (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
  }
  if (total > MAX_UNCOMPRESSED)
    throw new Error("Word 文档解压后过大，已拒绝解析以避免异常压缩包");
  const [documentXml, relXml] = await Promise.all([
    documentFile.async("string"),
    zip.file("word/_rels/document.xml.rels")?.async("string") || "",
  ]);
  const document = xml(documentXml);
  const relDoc = relXml ? xml(relXml) : null;
  const relationships = new Map<string, string>();
  if (relDoc) {
    for (const relationship of Array.from(relDoc.getElementsByTagNameNS("*", "Relationship"))) {
      relationships.set(relationship.getAttribute("Id") || "", relationship.getAttribute("Target") || "");
    }
  }
  const imageCache = new Map<string, string>();
  const body = document.getElementsByTagNameNS("*", "body")[0];
  if (!body) throw new Error("Word 文档没有正文结构");
  const blocks: DocxBlock[] = [];
  const warnings: DocxWarning[] = [];
  let blockNumber = 0;
  let sectionNumber = 1;
  let sectionTitle = "正文";
  let headingLevel = 0;
  let formulaCount = 0;
  let imageCount = 0;

  const pushBlock = (block: Omit<DocxBlock, "blockId" | "sectionId" | "sectionTitle">) => {
    blockNumber += 1;
    const blockId = `b${blockNumber}`;
    blocks.push({
      ...block,
      blockId,
      sectionId: `s${sectionNumber}`,
      sectionTitle,
    });
    return blockId;
  };

  for (const child of Array.from(body.children)) {
    if (child.localName === "p") {
      const style = styleInfo(child);
      if (style.headingLevel) {
        const title = inlineText(paragraphInlines(child, zip, relationships)).trim();
        if (title) {
          sectionNumber += 1;
          sectionTitle = title;
          headingLevel = style.headingLevel;
          pushBlock({ type: "heading", level: style.headingLevel, text: title, inlines: paragraphInlines(child, zip, relationships) });
          continue;
        }
      }
      const inlines = paragraphInlines(child, zip, relationships);
      const formulas = inlines.filter((inline) => inline.type === "formula").length;
      formulaCount += formulas;
      imageCount += inlines.filter((inline) => inline.type === "image").length;
      const text = inlineText(inlines);
      if (!text.trim() && !inlines.some((inline) => inline.type === "image")) continue;
      const blockId = pushBlock({
        type: style.list ? "list" : "paragraph",
        level: style.headingLevel || headingLevel,
        inlines,
        text,
      });
      for (const inline of inlines) {
        if (inline.type === "image" && inline.src.startsWith("@@DOCX_IMAGE:")) {
          const target = inline.src.slice("@@DOCX_IMAGE:".length, -2);
          const file = zip.file(`word/${target}`);
          if (file) imageCache.set(target, await fileDataUrl(file));
          else
            warnings.push({
              blockId,
              kind: "image",
              message: "图片关系指向的文件不存在，原位置保留提示。",
            });
        }
      }
      if (formulas > 0)
        warnings.push({
          blockId,
          kind: "formula",
          message: `本段包含 ${formulas} 个 Word 公式，已转为线性文本显示；分式/积分等复杂版式需对照原文件。`,
        });
      continue;
    }
    if (child.localName === "tbl") {
      const table = tableRows(child);
      const blockId = pushBlock({ type: "table", text: table.text, rows: table.rows });
      for (const row of table.rows)
        for (const cell of row)
          if (!cell.trim())
            warnings.push({ blockId, kind: "unsupported", message: "表格中有空单元格或无法转换的内容。" });
      continue;
    }
    if (["sectPr"].includes(child.localName)) continue;
    if (["oMathPara", "oMath"].includes(child.localName)) {
      const text = inlineChildren(child).trim();
      if (text) {
        formulaCount += 1;
        const blockId = pushBlock({ type: "paragraph", text, inlines: [{ type: "formula", text }] });
        warnings.push({ blockId, kind: "formula", message: "公式已转为线性文本显示。" });
      }
      continue;
    }
    const unsupported = ["altChunk", "object", "txbxContent"];
    if (unsupported.includes(child.localName)) {
      const blockId = pushBlock({ type: "paragraph", text: "[此处包含暂不支持的 Word 对象]" });
      warnings.push({
        blockId,
        kind: "unsupported",
        message: "此处有暂不支持的 Word 对象，已保留位置提示，不能假设内容已经读取。",
      });
    }
  }

  for (const block of blocks) {
    if (!block.inlines) continue;
    block.inlines = block.inlines.map((inline) =>
      inline.type === "image" && inline.src.startsWith("@@DOCX_IMAGE:")
        ? {
            ...inline,
            src:
              imageCache.get(inline.src.slice("@@DOCX_IMAGE:".length, -2)) ||
              "",
          }
        : inline,
    );
  }

  return {
    docId,
    fingerprint,
    fileName,
    format: "docx",
    parserVersion: PARSER_VERSION,
    title: blocks.find((block) => block.type === "heading")?.text || fileName,
    blocks,
    warnings,
    formulaCount,
    imageCount,
  };
}
