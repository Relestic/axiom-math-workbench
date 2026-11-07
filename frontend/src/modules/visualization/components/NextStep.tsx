import { ArrowRight } from "lucide-react";

export function NextStep({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  return (
    <section className="fw-next">
      <div>
        <h3>让图像中的发现，接上严谨的论证。</h3>
        <p>保留公式、定义域与条件，再回到教材检查关键步骤。</p>
      </div>
      <button className="btn" onClick={() => onNavigate("proof")}>
        查看证明思路 <ArrowRight size={15} />
      </button>
    </section>
  );
}
