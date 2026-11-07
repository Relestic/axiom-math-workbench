import { ArrowRight, BookmarkPlus, Settings2 } from "lucide-react";
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
          <p>用对话改变函数、添加参数与比较曲线，再沿着图像理解证明。</p>
        </div>
        <div className="button-row">
          <button
            className="btn"
            onClick={() => state.setSettings((value) => !value)}
          >
            <Settings2 size={15} />
            {state.status?.using_user_key
              ? "我的 DeepSeek"
              : state.status?.configured
                ? "模型已配置"
                : "接入 DeepSeek"}
          </button>
          <button className="btn primary" onClick={state.save}>
            <BookmarkPlus size={15} />
            保存观察
          </button>
        </div>
      </div>
      <div className="fw-status">
        <span
          className={state.status?.configured ? "fw-online" : "fw-offline"}
        >
          <i />
          {state.status?.configured
            ? `${state.status.using_user_key ? "我的 " : ""}${state.status.provider_label || state.status.provider} · ${state.status.model}`
            : "AI 未连接 · 可先直接编辑公式"}
        </span>
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
