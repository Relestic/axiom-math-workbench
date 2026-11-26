import type { CurriculumUnit, Exercise } from "../../domain/types";

export const offlineCurriculum: CurriculumUnit[] = [
  {
    id: "continuous",
    title: "函数的连续性",
    short: "连续性",
    chapter: "第 1 章",
    definition:
      "设 f:D→ℝ，x₀∈D。对任意 ε > 0，存在 δ > 0，使得对任意 x∈D，只要 |x − x₀| < δ，就有 |f(x) − f(x₀)| < ε，则称 f 在 x₀ 连续。",
    formula: "∀ ε > 0，∃ δ > 0，∀ x∈D：|x − x₀| < δ ⇒ |f(x) − f(x₀)| < ε",
    proof: [
      "以 f(x) = 2x + 1 为例，固定任意 x₀ ∈ ℝ。目标是把函数值的差控制在 ε 以内。",
      "任给 ε > 0，取 δ = ε/2。对满足 |x − x₀| < δ 的 x，有 |f(x) − f(x₀)| = 2|x − x₀| < 2δ = ε。",
      "因此 f 在任意 x₀ 连续。选择 δ 的动机是先把目标误差除以斜率的绝对值。",
    ],
    example:
      "点值与极限需要一致。将 f(x)=x 的 f(0) 改成 1，就在原点产生可去间断。",
    exercise: "用 ε–δ 定义证明 f(x)=2x+1 在任意 x₀∈ℝ 连续。",
    solution: [
      "任给 ε>0，取 δ=ε/2。",
      "若 |x−x₀|<δ，则 |f(x)−f(x₀)|=2|x−x₀|<ε。",
      "这满足连续性的定义，因此 f 在任意 x₀ 连续。",
    ],
    hint: "先将函数值的差写成自变量之差的倍数，再反推 δ。",
    conditions: [
      "x₀ 属于定义域 D；邻域内仅考虑 D 中的点",
      "ε 可以任意小",
      "δ 为正数，允许依赖 ε 和 x₀",
    ],
    tools: ["ε–δ 语言", "绝对值运算"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch7.pdf",
  },
  {
    id: "uniform",
    title: "一致连续",
    short: "一致连续",
    chapter: "第 2 章",
    definition:
      "设 f 定义在区间 I 上。对任意 ε > 0，存在 δ > 0，使得对所有 x₁、x₂ ∈ I，只要 |x₁ − x₂| < δ，就有 |f(x₁) − f(x₂)| < ε，则称 f 在 I 上一致连续。",
    formula:
      "∀ ε > 0，∃ δ > 0，∀ x₁,x₂ ∈ I：|x₁ − x₂| < δ ⇒ |f(x₁) − f(x₂)| < ε",
    proof: [
      "设 f 在非退化闭区间 [a,b] 上连续。反设 f 不一致连续。",
      "按定义的否定，存在 ε₀>0，使得对每个正整数 n 都能取 xₙ,yₙ∈[a,b]，满足 |xₙ−yₙ|<1/n，但 |f(xₙ)−f(yₙ)|≥ε₀。",
      "由有界数列的收敛子列定理，存在子列 xₙₖ→c。因为区间闭，c∈[a,b]。",
      "由 |yₙₖ−c|≤|yₙₖ−xₙₖ|+|xₙₖ−c|→0，得 yₙₖ→c。",
      "f 在 c 连续，故 f(xₙₖ) 和 f(yₙₖ) 都趋于 f(c)，其差趋于 0。这与始终不小于 ε₀ 矛盾。",
      "因此 f 在 [a,b] 上一致连续。这说明紧区间的条件如何把逐点连续提升为统一控制；退化区间只含一个点时结论显然成立。",
    ],
    example:
      "√x 在 [0,1] 上一致连续，但导数在 (0,1] 上无界。导数有界不是一致连续的必要条件。",
    exercise: "证明 f(x)=2x² 在 [0,1] 上一致连续，并证明它在 ℝ 上不一致连续。",
    solution: [
      "在 [0,1] 上，|2x²−2y²|=2|x−y||x+y|≤4|x−y|。任给 ε>0，取 δ=ε/4 即得一致连续。",
      "在 ℝ 上，取 xₙ=n，yₙ=n+1/n，则 |xₙ−yₙ|=1/n→0。",
      "但 |f(yₙ)−f(xₙ)|=4+2/n²>4。固定 ε₀=2，对任何 δ>0 取 n>1/δ，就违反一致连续所需的误差控制。",
    ],
    hint: "有界区间上估计 |x+y|；整个实数轴上尝试让两点越来越近，同时一起远离原点。",
    conditions: [
      "定义域是指定区间 I",
      "先给定 ε，再选择 δ",
      "δ 对 I 内所有点对同时有效",
      "闭且有界与连续是 Heine–Cantor 定理的充分条件",
    ],
    tools: ["ε–δ 语言", "收敛子列定理", "闭区间性质", "反证法"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch7.pdf",
  },
  {
    id: "derivative",
    title: "导数与微分",
    short: "导数",
    chapter: "第 3 章",
    definition:
      "若函数在内点 x₀ 的差商 [f(x₀+h)−f(x₀)]/h 在 h→0 时有有限极限，则称 f 在 x₀ 可导，该极限称为导数。",
    formula: "f′(x₀) = lim(h→0) [f(x₀+h) − f(x₀)] / h",
    proof: [
      "若 f 在 x₀ 可导，则差商在 h→0 时趋于有限值 f′(x₀)，因而在足够小的去心邻域内有界。",
      "当 h≠0 时，f(x₀+h)−f(x₀)=h·[f(x₀+h)−f(x₀)]/h。",
      "右侧是趋于 0 的量与有界量的乘积，因此趋于 0。由连续性定义，f 在 x₀ 连续。",
      "逆命题不成立。例如 |x| 在 0 连续，但右差商为 1、左差商为 −1，故在 0 不可导。",
    ],
    example:
      "|x| 的尖点说明连续不保证可导。x²sin(1/x) 在 0 补定义为 0 后可导，但导数在 0 不连续。",
    exercise: "证明 f(x)=2|x| 在 0 连续但不可导。",
    solution: [
      "|f(x)−f(0)|=2|x|→0，所以 f 在 0 连续。",
      "h>0 时 f(h)/h=2；h<0 时 f(h)/h=−2。",
      "左右极限不相等，差商没有双侧极限，因此 f 在 0 不可导。",
    ],
    hint: "对 h>0 与 h<0 分别写出差商。",
    conditions: ["x₀ 是定义域内点", "差商中的 h≠0", "双侧极限存在且有限"],
    tools: ["函数极限", "连续定义", "左右极限"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch8.pdf",
  },
  {
    id: "mean-value",
    title: "中值定理及应用",
    short: "中值定理",
    chapter: "第 4 章",
    definition:
      "设 a<b，f 在 [a,b] 上连续、在 (a,b) 上可导，则存在 ξ∈(a,b)，使 f′(ξ)=[f(b)−f(a)]/(b−a)。",
    formula: "f(b) − f(a) = f′(ξ)(b − a)，ξ ∈ (a,b)",
    proof: [
      "记割线斜率 m=[f(b)−f(a)]/(b−a)，构造 g(x)=f(x)−f(a)−m(x−a)。",
      "g 在 [a,b] 连续、在 (a,b) 可导，并且 g(a)=g(b)=0。",
      "由 Rolle 定理，存在 ξ∈(a,b)，使 g′(ξ)=0。",
      "由 g′(ξ)=f′(ξ)−m 得 f′(ξ)=m。减去割线函数的动机是创造相等的端点值。",
    ],
    example:
      "f(x)=|x| 在 [−1,1] 连续，但在 0 不可导；其割线斜率为 0，而区间内已有导数均为 ±1。",
    exercise: "用 Lagrange 中值定理证明 |sin x−sin y|≤|x−y|，其中 x,y∈[−2,2]。",
    solution: [
      "若 x=y，不等式显然成立。若 x≠y，sin 在连接 x,y 的闭区间上连续，在其内部可导。",
      "由中值定理，存在 ξ 介于 x,y 之间，使 sin x−sin y=cos ξ·(x−y)。",
      "因为 |cos ξ|≤1，取绝对值得 |sin x−sin y|≤|x−y|。",
    ],
    hint: "将函数值之差写成某处的导数乘以两点间距。",
    conditions: ["a<b", "闭区间 [a,b] 上连续", "开区间 (a,b) 上可导"],
    tools: ["Rolle 定理", "辅助函数", "导数运算"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch8.pdf",
  },
  {
    id: "taylor",
    title: "Taylor 公式与余项",
    short: "Taylor 公式",
    chapter: "第 5 章",
    definition:
      "在展开点附近，用有限阶多项式近似函数，并通过余项描述误差。在足够光滑的条件下，可以使用 Lagrange 余项。",
    formula: "eˣ = 1 + x + x²/2 + eᶿ x³/6，θ 介于 0 与 x 之间",
    proof: [
      "指数函数在实数轴上具有各阶连续导数，可以在 0 处使用二阶 Taylor 公式及 Lagrange 余项。",
      "0 处的函数值、一阶与二阶导数均为 1，故二阶多项式为 1+x+x²/2。",
      "存在介于 0 与 x 之间的 θ，使余项 R₂(x)=eᶿx³/6。",
      "若 |x|≤r，则 θ≤r，因此 |R₂(x)|≤eʳr³/6。这是有证明依据的误差上界，不是图像采样结果。",
    ],
    example:
      "多项式在展开点附近接近目标函数，不代表在整个实数轴上都具有同样的精度。",
    exercise: "写出 eˣ 在 0 处的二阶 Taylor 多项式，并估计 |x|≤1/2 时的余项。",
    solution: [
      "二阶多项式为 P₂(x)=1+x+x²/2。",
      "Taylor 定理给出 R₂(x)=eᶿx³/6，其中 θ 介于 0 与 x 之间。",
      "因为 θ≤1/2 且 |x|≤1/2，所以 |R₂(x)|≤e^(1/2)/48。",
    ],
    hint: "先写出带余项的等式，再用给定区间对指数因子和 x³ 分别估计。",
    conditions: [
      "检查所用余项形式的光滑性条件",
      "明确展开点和有限阶数",
      "误差估计限定在给定区间",
    ],
    tools: ["高阶导数", "Taylor 定理", "不等式估计"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch8.pdf",
  },
  {
    id: "primitive",
    title: "原函数与不定积分",
    short: "原函数",
    chapter: "第 6 章",
    definition:
      "若 F 在区间 I 上的导数等于 f，则称 F 是 f 在 I 上的原函数。区间上任意两个原函数之差为常数。",
    formula: "F′=f ⇒ ∫ f(x) dx = F(x)+C",
    proof: [
      "设 F 和 G 是同一区间上 f 的两个原函数，则 H=F−G 满足 H′=0。",
      "对区间内任意 x<y，H 在 [x,y] 上连续、在 (x,y) 上可导。",
      "由中值定理，H(y)−H(x)=H′(ξ)(y−x)=0。",
      "因此 H 在整个区间上是常数。区间这一条件保证任意两点之间仍处于定义域。",
    ],
    example:
      "原函数必须通过求导验证。常数 C 表示区间上所有原函数，不应在求不定积分时遗漏。",
    exercise: "求 ∫ x e^(2x) dx，并通过求导验证结果。",
    solution: [
      "分部积分取 u=x，dv=e^(2x)dx，所以 du=dx，v=e^(2x)/2。",
      "原式=x e^(2x)/2−e^(2x)/4+C=e^(2x)(2x−1)/4+C。",
      "对结果求导得 e^(2x)(2x−1)/2+e^(2x)/2=x e^(2x)，验证成立。",
    ],
    hint: "选 u=x，使求导后次数降低；将指数函数放在 dv 中。",
    conditions: [
      "原函数关系在同一区间内成立",
      "通过求导验证",
      "不定积分保留常数 C",
    ],
    tools: ["乘积求导", "分部积分", "中值定理"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch12.pdf",
  },
  {
    id: "riemann",
    title: "定积分与可积性",
    short: "Riemann 积分",
    chapter: "第 7 章",
    definition:
      "对有限闭区间上的有界函数，如果任给 ε>0，都存在一个分割 P，使 Darboux 上和 U(f,P) 与下和 L(f,P) 的差小于 ε，则函数 Riemann 可积。",
    formula: "∀ ε>0，∃ P：U(f,P)−L(f,P)<ε",
    proof: [
      "以 f(x)=2x 在 [0,1] 上为例，将区间等分成 n 份。因为函数递增，每段的下确界在左端、上确界在右端。",
      "下和 Lₙ=(2/n²)∑ᵢ₌₀ⁿ⁻¹i=(n−1)/n，上和 Uₙ=(2/n²)∑ᵢ₌₁ⁿi=(n+1)/n。",
      "故 Uₙ−Lₙ=2/n。任给 ε>0，取 n>2/ε，就有上下和差小于 ε。",
      "由 Darboux 判据，函数可积。上下和都趋于 1，故积分值为 1。",
    ],
    example:
      "Dirichlet 函数在有理点取 1、无理点取 0。任何分割的上下和差都是区间长度，因此在非退化闭区间上不可积。",
    exercise: "用 Darboux 上下和证明 f(x)=2x 在 [0,1] 上可积，并求积分。",
    solution: [
      "均匀分割 n 份，每段长 1/n。由单调性，Lₙ=(n−1)/n，Uₙ=(n+1)/n。",
      "Uₙ−Lₙ=2/n。给定 ε>0，取 n>2/ε 即满足 Darboux 可积判据。",
      "又 Lₙ≤∫₀¹2x dx≤Uₙ，两端都趋于 1，故积分为 1。",
    ],
    hint: "在每个小区间找出上下确界，注意“网格足够细”和“图像看起来接近”不是同一件事。",
    conditions: [
      "区间有限且闭",
      "函数有界",
      "上下确界是数学上的界，不是采样极值",
    ],
    tools: ["上确界与下确界", "有限求和", "Darboux 判据"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch11.pdf",
  },
  {
    id: "integral",
    title: "微积分基本定理",
    short: "微积分基本定理",
    chapter: "第 8 章",
    definition:
      "若 f 在 [a,b] 上连续，令 F(x)=∫ₐˣf(t)dt，则 F 在 (a,b) 内可导且 F′(x)=f(x)。若 G 是 f 的一个原函数，则 ∫ₐᵇf(x)dx=G(b)−G(a)。",
    formula: "d/dx [∫ₐˣ f(t)dt] = f(x)；∫ₐᵇ f(x)dx = G(b)−G(a)",
    proof: [
      "固定 x∈(a,b)，取非零 h 且 x+h∈[a,b]。积分可加性给出 [F(x+h)−F(x)]/h=(1/h)∫ₓˣ⁺ʰf(t)dt。",
      "减去 f(x)，其绝对值不超过连接 x 与 x+h 的区间上 |f(t)−f(x)| 的上确界。",
      "f 在 x 连续，故该上界随 h→0 趋于 0，因此 F′(x)=f(x)。",
      "若 G′=f，则 G−F 的导数为 0，由中值定理其在区间内为常数，再利用端点连续性，得到 G(b)−G(a)=F(b)−F(a)=∫ₐᵇf。",
    ],
    example:
      "积分是有向累积量。函数有负值时，定积分不能简单理解为所有几何面积的相加。",
    exercise:
      "设 F(x)=∫₀ˣ2t²dt，x∈[0,1]。求 F(x)、F′(x)（0<x<1），并核对所用条件。",
    solution: [
      "被积函数 2t² 在 [0,1] 连续，因此可以使用微积分基本定理。",
      "原函数为 2t³/3，故 F(x)=2x³/3。",
      "在内点 x∈(0,1)，F′(x)=2x²。这也可以直接对所得多项式求导核验。",
    ],
    hint: "分别用原函数计算累积量、用基本定理求其导数。",
    conditions: [
      "当前版本要求被积函数在闭区间上连续",
      "导数结论在区间内点使用",
      "检查原函数和积分区间",
    ],
    tools: ["积分可加性", "连续性", "中值定理"],
    source: "https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch12.pdf",
  },
].map(unit => ({ ...unit, prerequisites: [] }));

export function makeOfflineExercise(topicId: string, coefficient = 2): Exercise {
  const u = offlineCurriculum.find((item) => item.id === topicId) || offlineCurriculum[1];
  const k = Math.max(2, Math.min(5, Math.round(coefficient)));
  const variants: Record<string, { title: string; solution: string[] }> = {
    continuous: {
      title: `用 ε–δ 定义证明 f(x)=${k}x+1 在任意 x₀∈ℝ 连续。`,
      solution: [
        `任给 ε>0，取 δ=ε/${k}>0。这个选择源于 |f(x)−f(x₀)|=${k}|x−x₀|。`,
        `若 |x−x₀|<δ，则 |f(x)−f(x₀)|=${k}|x−x₀|<${k}δ=ε。`,
        "因此 f 在每个 x₀∈ℝ 连续。实际上 δ 不依赖 x₀，这还给出了在 ℝ 上一致连续的证明。",
      ],
    },
    uniform: {
      title: `证明 f(x)=${k}x² 在 [0,1] 上一致连续，并证明它在 ℝ 上不一致连续。`,
      solution: [
        `在 [0,1] 上，|f(x)−f(y)|=${k}|x−y||x+y|≤${2 * k}|x−y|。任给 ε>0，取 δ=ε/${2 * k}，则对任意 |x−y|<δ 都有 |f(x)−f(y)|<ε，故一致连续。`,
        `在 ℝ 上，取 xₙ=n，yₙ=n+1/n，两点距离为 1/n→0。函数值之差为 ${2 * k}+${k}/n²。`,
        `固定 ε₀=${k}。对任意 δ>0，取正整数 n>1/δ，则 |xₙ−yₙ|<δ，但 |f(xₙ)−f(yₙ)|>${k}。这正好否定一致连续，因此函数在 ℝ 上不一致连续。`,
      ],
    },
    derivative: {
      title: `证明 f(x)=${k}|x| 在 0 连续但不可导。`,
      solution: [
        `f(0)=0，且 |f(x)−f(0)|=${k}|x|→0，故在 0 连续。也可任给 ε>0 取 δ=ε/${k}。`,
        `当 h>0，差商 [f(h)−f(0)]/h=${k}；当 h<0，差商等于 −${k}。`,
        `左右差商极限分别为 ${k} 和 −${k}，不相等，故导数不存在。这给出“连续必可导”的反例。`,
      ],
    },
    "mean-value": {
      title: `用 Lagrange 中值定理证明 |sin x−sin y|≤|x−y|，其中 x,y∈[−${k},${k}]。`,
      solution: [
        "x=y 时两边都为 0。对 x≠y，sin 在连接 x 和 y 的闭区间上连续、在内部可导。",
        "由中值定理存在介于 x,y 之间的 ξ，使 sin x−sin y=cos ξ·(x−y)。",
        "|cos ξ|≤1，故 |sin x−sin y|≤|x−y|。证明实际对任意实数 x,y 都成立。",
      ],
    },
    taylor: {
      title: `写出 eˣ 在 0 处的二阶 Taylor 多项式，并给出 |x|≤1/${k} 时的严格余项上界。`,
      solution: [
        "指数函数具有所需的连续导数，故可用二阶 Taylor 公式：eˣ=1+x+x²/2+eᶿx³/6，其中 θ 介于 0 与 x 之间（x=0 时余项为 0）。",
        `在 |x|≤1/${k} 时，θ≤1/${k}，因此 |R₂(x)|≤e^(1/${k})/(6·${k}³)=e^(1/${k})/${6 * k * k * k}。`,
        "多项式为 1+x+x²/2。上面的界来自定理和区间估计，不依赖图像采样。",
      ],
    },
    primitive: {
      title: `求 ∫ x e^(${k}x) dx，验证结果并说明任意两个原函数相差常数的原因。`,
      solution: [
        `取 u=x，dv=e^(${k}x)dx，则 du=dx，v=e^(${k}x)/${k}。分部积分得 x e^(${k}x)/${k}−e^(${k}x)/${k * k}+C。`,
        `整理为 e^(${k}x)(${k}x−1)/${k * k}+C。对它求导：e^(${k}x)(${k}x−1)/${k}+e^(${k}x)/${k}=x e^(${k}x)。`,
        "任意两个原函数的差导数为 0。对区间内任意两点应用中值定理，可知差值相等，因此相差常数。",
      ],
    },
    riemann: {
      title: `用 Darboux 上下和证明 f(x)=${k}x 在 [0,1] 上可积，并求积分值。`,
      solution: [
        `等分 n 段，每段长 1/n。函数递增，故 Lₙ=${k}(n−1)/(2n)，Uₙ=${k}(n+1)/(2n)。`,
        `上下和之差为 ${k}/n。任给 ε>0，取正整数 n>${k}/ε，则 Uₙ−Lₙ<ε。由 Darboux 判据，f 可积。`,
        `由上下和夹住积分且二者都趋于 ${k}/2，可得 ∫₀¹${k}x dx=${k}/2。`,
      ],
    },
    integral: {
      title: `设 F(x)=∫₀ˣ${k}t²dt，x∈[0,1]。求 F(x)、F′(x)（0<x<1），并核对基本定理的条件。`,
      solution: [
        `被积函数 ${k}t² 在 [0,1] 上连续，故 Riemann 可积并满足当前使用的微积分基本定理的条件。`,
        `一个原函数是 ${k}t³/3，故 F(x)=${k}x³/3。`,
        `在 0<x<1 时，基本定理给出 F′(x)=${k}x²。直接对 ${k}x³/3 求导得到相同结果；端点处只讨论相应单侧导数。`,
      ],
    },
  };
  const v = variants[u.id];
  return {
    id: `${u.id}-${k}`,
    topicId: u.id,
    coefficient: k,
    title: v.title,
    solution: v.solution,
    hint: u.hint,
    checks: [
      "写清定义域与全部条件",
      "说明关键构造或引用依据",
      "覆盖边界情况并写出结论",
    ],
  };
}

export function offlineExerciseCatalog(): Exercise[] {
  return offlineCurriculum.flatMap((unit) =>
    [2, 3, 4, 5].map((coefficient) =>
      makeOfflineExercise(unit.id, coefficient),
    ),
  );
}

export const offlineSources: Record<string, string> = Object.fromEntries(
  offlineCurriculum.map((unit) => [unit.id, unit.source]),
);
