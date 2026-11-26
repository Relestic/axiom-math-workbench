import { LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { navigation } from "../../navigation";

type RailProps = {
  page: string; sidebar: boolean; collapsed: boolean; onToggle: () => void;
  closeMobile: () => void; navigate: (id: string) => void;
};

export function NavRail({page, sidebar, collapsed, onToggle, closeMobile, navigate}: RailProps) {
  return <>
    {sidebar && <div className="mobile-backdrop" onClick={closeMobile}/>}
    <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
      <button className="brand" onClick={() => navigate("dashboard")}>
        <span className="brand-symbol"><LayoutGrid size={22}/></span>
        <span className="brand-copy"><strong>Axiom 公理</strong><small>数学学习工作台</small></span>
      </button>
      <button className="rail-toggle" aria-label={collapsed ? "展开导航" : "折叠导航"} aria-expanded={!collapsed} onClick={onToggle}>
        {collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}<span>折叠导航</span>
      </button>
      <nav aria-label="主导航" className="nav-group">
        {navigation.map(([id,label,Icon]) => <button key={id} aria-label={label} title={label}
          className={`nav-item ${page === id ? "active" : ""}`} aria-current={page===id ? "page" : undefined} onClick={()=>navigate(id)}>
          <Icon size={17}/><span>{label}</span>
        </button>)}
      </nav>
    </aside>
  </>;
}
