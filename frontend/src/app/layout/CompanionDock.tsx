import { PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";

export function CompanionDock({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <aside className="companion-dock" aria-label="数学伴学">
    <header className="dock-heading">
      <span className="dock-title"><Sparkles size={17} />数学伴学</span>
      <button className="icon-button" onClick={onToggle} aria-expanded={!collapsed}
        aria-label={collapsed ? "展开伴学栏" : "收起伴学栏"}>
        {collapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
      </button>
    </header>
    <div className="dock-body" hidden={collapsed}>
      <div className="companion-stage" aria-label="Hiyori 舞台" />
    </div>
  </aside>;
}
