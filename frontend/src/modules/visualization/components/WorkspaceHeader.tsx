import { ArrowRight, BookmarkPlus } from "lucide-react";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";

export function WorkspaceHeader({
  state,
  onNavigate,
}: {
  state: FunctionWorkspaceState;
  onNavigate: (page: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="badge">自由函数工作区 · 数学分析</span>
          <h1>先有问题，再有图像。</h1>
          <p>可在右侧向 Hiyori 描述想观察的函数或图像变化。</p>
        </div>
        <div className="button-row">
          <button className="btn primary" onClick={state.save}>
            <BookmarkPlus size={15} />
            保存观察
          </button>
        </div>
      </div>
      <div className="fw-status">
        <button className="text-button" onClick={() => onNavigate("surface")}>
          三维曲面实验室 <ArrowRight size={13} />
        </button>
        <button
          className="text-button"
          onClick={() => state.setClassic(true)}
        >
          经典教学与三维示例 <ArrowRight size={13} />
        </button>
      </div>
    </>
  );
}
