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
  "∂": "\\partial ", "∇": "\\nabla ", "∬": "\\iint ", "∭": "\\iiint ", "∮": "\\oint ",
  "±": "\\pm ", "∓": "\\mp ", "∝": "\\propto ", "≡": "\\equiv ", "⊂": "\\subset ", "⊆": "\\subseteq ",
  "½": "\\frac{1}{2}", "𝓏": "z", "\u200b": "", "；": ";\\quad ",
};
const subs: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "ₐ": "a", "ₑ": "e", "ₕ": "h", "ᵢ": "i", "ⱼ": "j", "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n",
  "ₒ": "o", "ₚ": "p", "ᵣ": "r", "ₛ": "s", "ₜ": "t", "ᵤ": "u", "ᵥ": "v", "ₓ": "x", "ᵧ": "y",
  "₌": "=", "₊": "+", "₋": "-", "₍": "(", "₎": ")",
};
const supers: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")", "ⁱ": "i", "ʲ": "j", "ᵏ": "k", "ⁿ": "n",
  "ˣ": "x", "ʸ": "y", "ᵗ": "t", "ᵃ": "a", "ᵇ": "b", "ᶜ": "c", "ᶿ": "\\theta ",
};
const symbolChars = new RegExp("[" + Object.keys(symbols).join("") + "]", "gu");
const subRun = new RegExp("[" + Object.keys(subs).join("") + "]+", "gu");
const superRun = new RegExp("[" + Object.keys(supers).join("") + "]+", "gu");
const scriptChar = new RegExp("[" + Object.keys(subs).concat(Object.keys(supers)).join("") + "]", "u");
const operators = /\b(sin|cos|tan|sinh|cosh|tanh|log|ln|exp|max|min|sup|inf|det|sgn|diag|erf|grad|div|curl)\b/g;
const namedOperators = new Set(["sgn", "diag", "erf", "grad", "div", "curl"]);
const compactIndices = /\b(?:[A-Za-z]\d+|[abcdfghpqrstuvwxyz][ijknm])+\b/g;

export function toLatex(raw: string, delimited = false): string {
  let source = raw.replace(/[。；]+\s*$/u, "");
  if (!delimited && !source.includes("\\")) {
    // A card using TeX scripts already specifies its own subscript boundaries.
    if (!/[_^{}]/.test(source)) {
      source = source.replace(compactIndices, word => word.replace(/([A-Za-z])(\d+|[ijknm])/g, "$1_{$2}"));
    }
    source = source.replace(/\.\.\./g, "\\ldots ")
      .replace(/√(?:\(([^()]*)\)|([a-zA-Z0-9]))/gu, (_, group, atom) => "\\sqrt{" + (group ?? atom) + "}")
      .replace(/\^\(([^()]+)\)/g, "^{$1}")
      .replace(/\blim\(([^()]*)\)/gu, "\\lim_{$1}")
      .replace(operators, op => namedOperators.has(op) ? "\\operatorname{" + op + "}" : "\\" + op + " ");
  }
  return source
    .replace(subRun, run => "_{" + Array.from(run, c => subs[c]).join("") + "}")
    .replace(superRun, run => "^{" + Array.from(run, c => supers[c]).join("") + "}")
    .replace(symbolChars, c => symbols[c]);
}

export type MathPart = { text: string; kind: "text" | "inline" | "block"; delimited: boolean };
function legacyParts(text: string): MathPart[] {
  // Original teaching material interleaves Chinese prose with unmarked Unicode or ASCII notation.
  const pieces = text.split(/([\p{Script=Han}，。；：、！？“”「」（）\n]+)/gu);
  return pieces.filter(Boolean).map(part => {
    const shortProduct = /^\s*(?:l[uvw]|[xyz]{2}|\d+[A-Za-z])\s*$/.test(part);
    const stripped = part
      .replace(/(?:[_^]|\\[A-Za-z]+)\{[^{}]*\}/g, " ")
      .replace(/\\[A-Za-z]+/g, " ")
      .replace(operators, " ")
      .replace(/\b(?:lim|(?:d[xyztsuvwSVA])+)\b/g, " ")
      .replace(compactIndices, " ")
      .replace(/_[A-Za-z0-9]/g, " ");
    // Short products (bx, Tu, abt) and partial derivatives (uxx) occur next
    // to operators in old PDE cards. A standalone word or name stays prose.
    const tokens = stripped.match(/[A-Za-z]+|\S/gu) ?? [];
    const hasProse = !shortProduct && tokens.some((word, i) => {
      if (!/^[A-Za-z]{2}/.test(word)) return false;
      const adjacent = (tokens[i - 1] ?? "") + (tokens[i + 1] ?? "");
      return word.length > 3 || !(/[()[\]^,+\-=−′]/.test(adjacent) || scriptChar.test(adjacent));
    });
    const formula = !hasProse && !/[\p{Script=Han}，。；：、！？“”「」（）\n]/u.test(part)
      && (shortProduct || /[\\∀∃∫∑ΣΔ≤≥≠∈→⇒∞α-ωℝℕℤ=<>^_√|∂∇∬∭∮±∓∝≡⊂⊆½𝓏−+]/u.test(part) || scriptChar.test(part)
        || /(?:[A-Za-z]\(|\[[a-z0-9,]+\]|\b[a-zA-Z][0-9]*\b|\b[abcdfghpqrstuvwxyz][ijknm]\b)/u.test(part))
      && !/https?:\/\//.test(part);
    return { text: part, kind: formula ? "inline" : "text", delimited: false };
  });
}

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  // Consume escaped characters as pairs, so \$ and \\ never open or close math.
  let offset = 0;
  let closing = "";
  let start = 0;
  for (let i = 0; i < text.length;) {
    if (closing && text.startsWith(closing, i)) {
      parts.push({ kind: closing === "$$" || closing === "\\]" ? "block" : "inline",
        text: text.slice(start, i), delimited: true });
      i += closing.length;
      offset = i;
      closing = "";
      continue;
    }
    const token = text[i] === "\\" ? text.slice(i, i + 2) : text.startsWith("$$", i) ? "$$" : text[i];
    if (!closing && (token === "$" || token === "$$" || token === "\\(" || token === "\\[")) {
      parts.push(...legacyParts(text.slice(offset, i)));
      offset = i;
      start = i + token.length;
      closing = token === "\\(" ? "\\)" : token === "\\[" ? "\\]" : token;
    }
    i += token.length;
  }
  if (closing) parts.push({ kind: "text", text: text.slice(offset), delimited: false });
  else parts.push(...legacyParts(text.slice(offset)));
  return parts;
}
