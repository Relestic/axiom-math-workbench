import { LayoutGrid, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { navigation } from "../../navigation";

type RailProps = {
  page: string; sidebar: boolean; collapsed: boolean; name: string; mastery: number;
  serverMode: boolean; role?: string; onToggle: () => void; closeMobile: () => void;
  navigate: (id: string) => void; openProfile: () => void;
};
export function NavRail({ page, sidebar, collapsed, name, mastery, serverMode, role,
  onToggle, closeMobile, navigate, openProfile }: RailProps) {
  return (
    <>
      {sidebar && (
        <div className="mobile-backdrop" onClick={() => closeMobile()} />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <button className="brand" onClick={() => navigate("dashboard")}>
          <span className="brand-symbol">
            <LayoutGrid size={22} />
          </span>
          <span className="brand-copy">
            <strong>Axiom 公理</strong>
            <small>数学系 AI 学习工作台</small>
          </span>
        </button>
        <button className="rail-toggle" aria-label={collapsed ? "展开导航" : "折叠导航"} aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}
          <span>折叠导航</span>
        </button>
        <nav aria-label="主导航">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-caption">{group.label}</div>
              {group.items.map(([id, label, Icon]) => (
                <button
                  key={id}
                  aria-label={label} title={label}
                  className={`nav-item ${page === id ? "active" : ""}`}
                  onClick={() => navigate(id)}
                  aria-current={page === id ? "page" : undefined}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="course-widget"
            onClick={() => navigate("practice-map")}
          >
            <span className="muted">
              当前课程 <span>···</span>
            </span>
            <strong>数学分析</strong>
            <small>连续性 → 定积分 · MVP</small>
            <div className="progress-track">
              <i
                style={{
                  width: `${Math.max(4, mastery)}%`,
                }}
              />
            </div>
            <small>
              {serverMode ? "服务端掌握度" : "示例学习进度"} ·{" "}
              {mastery}%
            </small>
          </button>
          <div className="profile">
            <button className="avatar" onClick={() => openProfile()}>
              {name.slice(0, 1)}
            </button>
            <button
              className="profile-name"
              onClick={() => openProfile()}
            >
              <strong>{name}</strong>
              <small>
                {serverMode
                  ? `${role === "admin" ? "管理员" : "数学系"} · 已连接后端`
                  : "数学系 · 本地空间"}
              </small>
            </button>
            <button
              className="icon-button dark-icon"
              aria-label="个人设置"
              onClick={() => openProfile()}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
