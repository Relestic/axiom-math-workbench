import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { CompanionDock } from "./CompanionDock";
import "../../styles/workbench.css";

export function ThemeSwitch() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === "dark");
  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("axiom-theme", next); } catch { /* Current tab still updates. */ }
    setDark(!dark);
  }
  return <button className="icon-button" aria-label={dark ? "切换浅色主题" : "切换深色主题"} onClick={toggle}>
    {dark ? <Sun size={18} /> : <Moon size={18} />}
  </button>;
}

export function WorkbenchShell({ rail, children, collapsed }: {
  rail: ReactNode; children: ReactNode; collapsed: boolean;
}) {
  const [dockCollapsed, setDockCollapsed] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 1023px)");
    const onResize = () => setDockCollapsed(narrow.matches);
    narrow.addEventListener("change", onResize);
    return () => narrow.removeEventListener("change", onResize);
  }, []);
  return <div className="workbench-shell" data-rail={collapsed ? "closed" : "open"} data-dock={dockCollapsed ? "closed" : "open"}>
    {rail}
    {children}
    <CompanionDock collapsed={dockCollapsed} onToggle={() => setDockCollapsed(!dockCollapsed)} />
  </div>;
}
