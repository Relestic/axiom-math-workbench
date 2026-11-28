import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import katex from "katex";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

await build({
  stdin: { contents: 'export * from "./src/components/Math/notation"; export * from "./src/components/Math";', resolveDir: process.cwd() },
  bundle: true,
  outfile: ".test-build/notation-components.mjs",
  external: ["react"],
  loader: { ".css": "empty" },
  platform: "node",
  format: "esm",
});
const { MathBlock, MathText, splitMath, toLatex } = await import("../.test-build/notation-components.mjs");
const render = (component, source) => renderToStaticMarkup(createElement(component, null, source));

function assertKatex(latex) {
  const html = katex.renderToString(latex, { throwOnError: false, strict: "ignore" });
  assert.doesNotMatch(html, /class="katex-error"/, latex);
}

const standard = [
  "u_t-ku_{xx}+Vu_x=0", "u_t=v_t-Vv_y", "w=u_1-u_2",
  "l(c_1u+c_2v)=c_1l(u)+c_2l(v)=0",
  "a_{11}u_{xx}+2a_{12}u_{xy}+a_{22}u_{yy}+a_1u_x+a_2u_y+a_0u=0",
  "Aq_k=d_kq_k", "Tu_tu_x",
];
for (const source of standard) {
  test("preserves standard subscripts in " + source, () => {
    const marked = "$" + source + "$";
    const [part] = splitMath(marked);
    assert.equal(part.delimited, true);
    assert.equal(toLatex(part.text, part.delimited), source);
    assert.equal(toLatex(source, false), source);
    assertKatex(toLatex(part.text, part.delimited));
    assert.match(render(MathText, marked), /class="katex"/);
  });
}

const movingFrame = String.raw`$y=x-Vt,\quad u(x,t)=v(x-Vt,t),\quad v_t=kv_{yy}$`;
const cases = String.raw`$$f(x)=\begin{cases}x & x>0 \\ -x & x\le 0\end{cases}$$`;
for (const marked of [movingFrame, cases, String.raw`\(\$+c1+un\)`, String.raw`\[u_t=v_t-Vv_y\]`, String.raw`$x+\$+y$`]) {
  test("renders one outer pair in display mode " + marked, () => {
    const html = render(MathBlock, "  " + marked + "。；  ");
    assert.match(html, /class="katex-display"/);
    assert.doesNotMatch(html, /math-fallback|katex-error|。|；/);
    const [part] = splitMath(marked);
    assert.equal(toLatex(part.text, part.delimited), part.text);
  });
}

test("keeps prose and renders each delimited expression in a formula field", () => {
  for (const source of [
    String.raw`对 $f\in\{\phi,\psi\}$，令 $f_{\mathrm{ext}}(x)=f(x)$（$0<x<l$）。`,
    String.raw`$a_1u_x$ and $b_2u_y$`,
    String.raw`\[x\] and \(y\)`,
  ]) {
    const html = render(MathBlock, source);
    assert.equal((html.match(/class="katex"/g) ?? []).length, source.includes("令") ? 3 : 2);
    assert.ok(html.includes(source.includes("令") ? "，令 " : " and "));
    assert.doesNotMatch(html, /math-fallback|katex-error|\$/);
  }
});

const legacyPDE = [
  ["F(y)=∫ᵧ₀ʸ f(t)dt", ["\\int", "_{y0}^{y}"]],
  ["∮_{∂D} T∂u/∂n ds = ∬_D ρuₜₜ dxdy", ["\\oint", "\\partial", "\\iint", "_{tt}"]],
  ["Δu=∇·(∇u)=uₓₓ+uᵧᵧ+u_{zz}", ["\\nabla", "u_{xx}+u_{yy}+u_{zz}"]],
  ["det ∂(x′,y′)/∂(x,y)=−(a²+b²)≠0", ["\\det", "\\partial", "^{2}", "\\ne"]],
  ["∭_D cρu dV", ["\\iiint"]],
  ["∇²", ["\\nabla", "^{2}"]],
  ["Σᵢ₌₁ⁿ", ["\\sum", "_{i=1}^{n}"]],
  ["x(t) = ξ + ct", ["\\xi", "ct"]],
];
for (const [source, fragments] of legacyPDE) {
  test("recovers the complete legacy expression " + source, () => {
    assert.deepEqual(splitMath(source), [{ kind: "inline", text: source, delimited: false }]);
    const latex = toLatex(source, false);
    for (const fragment of fragments) assert.ok(latex.includes(fragment), latex);
    assertKatex(latex);
    assert.match(render(MathText, source), /class="katex"/);
  });
}

test("normalizes Unicode alongside existing TeX commands in either dialect", () => {
  const source = String.raw`\partial uₓ≤½𝓏−x，x∈ℝ；x≥0≠1…` + "\u200b";
  for (const delimited of [false, true]) {
    const latex = toLatex(source, delimited);
    for (const value of ["\\partial", "u_{x}", "\\le", "\\frac{1}{2}z-", "\\mathbb{R}", ";\\quad", "\\ge", "\\ne", "\\ldots"]) {
      assert.ok(latex.includes(value), latex);
    }
    assert.ok(!latex.includes("\u200b"));
    assertKatex(latex);
  }
});

test("renders the punctuated Schrödinger equation with Unicode summation limits", () => {
  const source = "−ihuₜ = Σᵢ₌₁ⁿ [h²/(2mᵢ)](∂²u/∂xᵢ² + ∂²u/∂yᵢ² + ∂²u/∂zᵢ²) + V(x₁,y₁,z₁,…,xₙ,yₙ,zₙ)u。";
  const html = render(MathBlock, source);
  assert.match(html, /class="katex-display"/);
  assert.doesNotMatch(html, /katex-error|math-fallback|。|₌/);
});

test("keeps English names and URLs as prose", () => {
  for (const source of ["UC Davis", "Heine–Cantor", "Taylor", "test(x)", "https://example.org/a_1?q=x"]) {
    assert.deepEqual(splitMath(source).map(part => part.kind), ["text"]);
  }
});

test("recognizes products, intervals and coordinates embedded in Strauss prose", () => {
  for (const source of ["l(u+(-1)v)=lu+(-1)lv", "[ch,b+ch]", "bx−ay", "ye^(−x)", "lu", "lv", "lw", "xy", "3n"]) {
    assert.equal(splitMath(source)[0].kind, "inline", source);
    assertKatex(toLatex(source));
  }
});

test("recovers a renderable original when a legacy limit would acquire two subscripts", () => {
  const source = "lim(x)ₙ";
  assert.match(katex.renderToString(toLatex(source), { throwOnError: false }), /class="katex-error"/);
  assertKatex(source);
  assert.match(render(MathText, source), /class="katex"/);
});

test("keeps an invalid segment local to its formula in a mixed block", () => {
  const html = render(MathBlock, String.raw`若 $\unknownMacro{x}$，则 $a_1u_x=0$。`);
  assert.match(html, /class="math-fallback"/);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\$/);
});

test("splits a failed unmarked block and keeps any renderable segments", () => {
  const html = render(MathBlock, String.raw`x_1；\unknownMacro{x}`);
  assert.match(html, /class="katex"/);
  assert.match(html, /class="math-fallback"/);
});

test("keeps unmarked index guesses out of each explicit delimiter style", () => {
  for (const source of ["$c1+un$", "$$c1+un$$", String.raw`\(c1+un\)`, String.raw`\[c1+un\]`]) {
    for (const component of [MathText, MathBlock]) {
      assert.match(render(component, source), /<annotation encoding="application\/x-tex">c1\+un<\/annotation>/);
    }
  }
});

test("groups Unicode script runs and recovers PDE operators and differentials", () => {
  const raw = "uₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵧ₌₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ⁱʲᵏⁿˣʸᵗᵃᵇᶜᶿ";
  const latex = toLatex(raw, true);
  assert.equal(latex, "u_{aehijklmnoprstuvxy=+-}^{0123456789+-=ijknxytabc\\theta }");
  assertKatex(latex);
  for (const symbol of ["±", "∓", "∝", "≡", "⊂", "⊆"]) {
    assert.equal(splitMath(symbol)[0].kind, "inline");
    assertKatex(toLatex(symbol));
  }
  for (const word of ["sgn", "diag", "erf", "grad", "div", "curl"]) {
    assert.equal(splitMath(word + "(x)")[0].kind, "inline");
    assertKatex(toLatex(word + "(x)"));
  }
  for (const dx of ["dx", "dy", "dz", "dt", "ds", "du", "dv", "dw", "dS", "dV", "dA", "dxdy", "dxdt", "dydt"]) {
    assert.equal(splitMath("∫_{b+ch} u " + dx)[0].kind, "inline");
  }
});

test("recovers unmarked ASCII subscripts, operators, and sequences from legacy cards", () => {
  const sample = "对于线性方程 lu=0，若 u1,...,un 都是解，则任意常数线性组合 c1u1(x)+…+cnun(x) 也是解（cj 为常数）。";
  const parts = splitMath(sample);
  const inline = parts.filter(p => p.kind === "inline").map(p => toLatex(p.text).trim());
  assert.deepEqual(inline, [
    "lu=0",
    "u_{1},\\ldots ,u_{n}",
    "c_{1}u_{1}(x)+\\ldots +c_{n}u_{n}(x)",
    "c_{j}",
  ]);
});

test("renders underscore pairs like c_1,c_2 while keeping English prose as text", () => {
  const parts = splitMath("任取常数 c_1,c_2，参考 UC Davis 分析讲义与 Heine–Cantor 定理。");
  const math = parts.filter(p => p.kind === "inline").map(p => p.text.trim());
  const text = parts.filter(p => p.kind === "text").map(p => p.text).join("");
  assert.deepEqual(math, ["c_1,c_2"]);
  assert.ok(text.includes("UC Davis"));
  assert.ok(text.includes("Heine–Cantor"));
});
