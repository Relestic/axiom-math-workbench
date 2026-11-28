const symbols: Record<string, string> = {
  "∀": "\\forall ", "∃": "\\exists ", "ε": "\\varepsilon ", "δ": "\\delta ",
  "ξ": "\\xi ", "η": "\\eta ", "θ": "\\theta ", "α": "\\alpha ", "β": "\\beta ",
  "π": "\\pi ", "Δ": "\\Delta ", "Σ": "\\sum ", "∑": "\\sum ",
  "∞": "\\infty ", "∫": "\\int ", "≤": "\\le ", "≥": "\\ge ", "≠": "\\ne ",
  "∈": "\\in ", "∉": "\\notin ", "∪": "\\cup ", "∩": "\\cap ",
  "→": "\\to ", "⇒": "\\Rightarrow ", "⇔": "\\Leftrightarrow ",
  "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}",
  "×": "\\times ", "÷": "\\div ", "·": "\\cdot ", "≈": "\\approx ",
  "−": "-", "′": "'", "″": "''", "…": "\\ldots ", "，": ",\\;", "：": ":\\;",
};
const subs = "₀₁₂₃₄₅₆₇₈₉ₙₖᵢⱼₐ";
const supers = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ˣᵇᶿ";

export function toLatex(raw: string): string {
  if (raw.includes("\\")) return raw;
  return raw
    .replace(/\.\.\./g, "\\ldots ")
    .replace(/([A-Za-z0-9α-ωΑ-Ω)\]])_([A-Za-z0-9+-]{2,})/gu, "$1_{$2}")
    .replace(/\b([A-Za-z])([0-9]+)\b/g, "$1_{$2}")
    .replace(/([A-Za-z])([0-9]+)(?=[A-Za-z(])/g, "$1_{$2}")
    .replace(/\b([abcdfghpqrstuvwxyz])([ijknm])([abcdfghpqrstuvwxyz])([ijknm])(?=\b|\()/g, "$1_{$2}$3_{$4}")
    .replace(/\b([abcdfghpqrstuvwxyz])([ijknm])\b/g, "$1_{$2}")
    .replace(/[₀-₉ₙₖᵢⱼₐ]+/gu, (s) => "_{" + Array.from(s, c => "0123456789nkija"[subs.indexOf(c)]).join("") + "}")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ˣᵇᶿ]+/gu, (s) => "^{" + Array.from(s, c => (c === "ᶿ" ? "\\theta " : "0123456789-+xb"[supers.indexOf(c)])).join("") + "}")
    .replace(/√(?:\(([^()]*)\)|([a-zA-Z0-9]))/gu, (_, group, atom) => "\\sqrt{" + (group ?? atom) + "}")
    .replace(/lim\(([^()]*)\)/gu, "\\lim_{$1}")
    .replace(/\b(sin|cos|tan|log|ln|exp|max|min|sup|inf)\b/gu, "\\$1 ")
    .replace(/[∀∃εδξηθαβπΔΣ∑∞∫≤≥≠∈∉∪∩→⇒⇔ℝℕℤ×÷·≈−′″…，：]/gu, c => symbols[c]);
}

export type MathPart = { text: string; kind: "text" | "inline" | "block" };
function legacyParts(text: string): MathPart[] {
  // Original teaching material interleaves Chinese prose with unmarked Unicode or ASCII notation.
  const pieces = text.split(/([\p{Script=Han}，。；：、！？“”「」（）\n]+)/gu);
  return pieces.filter(Boolean).map(part => {
    const stripped = part
      .replace(/\b(?:sin|cos|tan|exp|log|ln|lim|sup|inf|max|min|dx|dy|dt|du|dv)\b/g, "")
      .replace(/(?:[A-Za-z]_[A-Za-z0-9+-]+|[A-Za-z][0-9]+|\b[abcdfghpqrstuvwxyz][ijknm]\b|(?:[abcdfghpqrstuvwxyz][ijknm]){2,}|\b[A-Za-z]{2}(?=\s*[=(+\-]))/g, "");
    const hasProse = !part.includes("\\") && /\b[A-Za-z]{2,}\b/.test(stripped);
    const formula = !hasProse && !/[\p{Script=Han}，。；：、！？“”「」（）\n]/u.test(part)
      && (/[\\∀∃∫∑≤≥≠∈→⇒∞α-ωℝℕ₀-₉⁰-⁹=<>^_√|]/u.test(part)
        || /(?:[A-Za-z]\(|\[[a-z0-9,]+\]|\b[a-zA-Z][0-9]*\b|\b[abcdfghpqrstuvwxyz][ijknm]\b)/u.test(part))
      && !/https?:\/\//.test(part);
    return { text: part, kind: formula ? "inline" : "text" };
  });
}

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  const open = /\$\$|\$|\\\(|\\\[/g;
  let offset = 0;
  for (let m = open.exec(text); m; m = open.exec(text)) {
    parts.push(...legacyParts(text.slice(offset, m.index)));
    const delimiter = m[0];
    const closing = delimiter === "\\(" ? "\\)" : delimiter === "\\[" ? "\\]" : delimiter;
    const end = text.indexOf(closing, open.lastIndex);
    if (end < 0) return [...parts, { kind: "text", text: text.slice(m.index) }];
    parts.push({ kind: delimiter === "$$" || delimiter === "\\[" ? "block" : "inline",
      text: text.slice(open.lastIndex, end) });
    offset = open.lastIndex = end + closing.length;
  }
  return [...parts, ...legacyParts(text.slice(offset))];
}
