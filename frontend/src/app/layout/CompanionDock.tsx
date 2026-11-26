import type { DeskPanes } from "../../modules/companion/workspace";
import { useEffect, useRef, useState } from "react";
import type { CompanionStage } from "../../modules/companion/CompanionStage";
import { CompanionPanel } from "../../modules/companion/CompanionPanel";
import { PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";

export function CompanionDock({ page, desk, collapsed, onToggle }: { page: string; desk?: DeskPanes; collapsed: boolean; onToggle: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const stage = useRef<CompanionStage | null>(null);
  const collapsedNow = useRef(collapsed);
  collapsedNow.current = collapsed;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    void import("../../modules/companion/CompanionStage").then(async ({ CompanionStage }) => {
      if (disposed || !element.current) return;
      const instance = new CompanionStage();
      stage.current = instance;
      instance.setFps(collapsedNow.current ? 10 : 30);
      await instance.mount(element.current);
    }).catch(() => { if (!disposed) setUnavailable(true); });
    return () => {
      disposed = true;
      stage.current?.unmount();
      stage.current = null;
    };
  }, []);
  useEffect(() => { stage.current?.setFps(collapsed ? 10 : 30); }, [collapsed]);
  return <aside className="companion-dock" aria-label="数学伴学">
    <header className="dock-heading">
      <span className="dock-title"><Sparkles size={17} />数学伴学</span>
      <button className="icon-button" onClick={onToggle} aria-expanded={!collapsed}
        aria-label={collapsed ? "展开伴学栏" : "收起伴学栏"}>
        {collapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
      </button>
    </header>
    <div className="dock-body" hidden={collapsed}>
      <CompanionPanel page={page} desk={desk} stage={stage} stageView={
        <div ref={element} className="companion-stage" aria-label="Hiyori 舞台">
        {unavailable && <p role="status">此设备无法显示 WebGL 舞台。</p>}
        </div>
      } />
    </div>
  </aside>;
}
