import { Suspense, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, PanelRightClose, PanelRightOpen, Presentation } from "lucide-react";
import { ModuleSelect, useUnit } from "../../pages/learning/shared";
import "./desk.css";

const studyTabs = [
  ["textbook", "讲义定义"], ["examples", "正反例"], ["proof", "证明思路"],
  ["exercises", "练习与复盘"],
] as const;
const boardTabs = [
  ["explore", "2D 函数"], ["surface", "3D 曲面"], ["pdf", "课本原文"],
] as const;
const studyPanes = [...studyTabs, ["review", "作答复盘"]] as const;
type Tabs = ReadonlyArray<readonly [string, string]>;

function isBoard(id: string) {
  return boardTabs.some(([value]) => value === id);
}

function DeskTabs({ tabs, active, label, select }: {
  tabs: Tabs;
  active: string;
  label: string;
  select: (id: string) => void;
}) {
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = (index + tabs.length - 1) % tabs.length; break;
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
    select(tabs[next][0]);
  }
  return <div className="desk-tabs" role="tablist" aria-label={label}>
    {tabs.map(([id, title], index) => {
      const selected = id === active || (id === "exercises" && active === "review");
      return <button key={id} id={`desk-tab-${id}`} type="button" role="tab"
        aria-selected={selected} aria-controls={`desk-pane-${selected ? active : id}`}
        tabIndex={selected ? 0 : -1} onClick={() => select(id)}
        onKeyDown={(event) => moveFocus(event, index)}>{title}</button>;
    })}
  </div>;
}

type DeskSelection = {
  route: string;
  study: string;
  board: string;
  active: string;
  collapsed: boolean;
  visited: string[];
};

function openRoute(pane: string, previous?: DeskSelection): DeskSelection {
  const board = isBoard(pane) ? pane : previous?.board ?? "explore";
  const study = isBoard(pane) ? previous?.study ?? "textbook" : pane;
  return {
    route: pane, study, board, active: pane,
    collapsed: !isBoard(pane) && (previous?.collapsed ?? false),
    visited: [...new Set([...(previous?.visited ?? []), study, board])],
  };
}

export function DeskWorkbench({ pane, navigate, renderPane, onActivePane }: {
  pane: string;
  navigate: (id: string) => void;
  renderPane: (id: string) => ReactNode;
  onActivePane: (id: string) => void;
}) {
  const { unit, select } = useUnit();
  const [desk, setDesk] = useState(() => openRoute(pane));
  const toggleButton = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  if (pane !== desk.route) setDesk(openRoute(pane, desk));
  useLayoutEffect(() => { onActivePane(desk.active); }, [desk.active, onActivePane]);
  useLayoutEffect(() => {
    if (restoreToggleFocus.current) {
      restoreToggleFocus.current = false;
      toggleButton.current?.focus();
    }
  }, [desk.collapsed]);

  function focusPane(id: string) {
    setDesk((current) => current.active === id ? current : { ...current, active: id });
  }
  function selectPane(id: string) {
    focusPane(id);
    if (id !== pane) navigate(id);
  }
  function toggleBoard() {
    restoreToggleFocus.current = true;
    if (desk.collapsed) {
      setDesk((current) => ({ ...current, collapsed: false }));
      selectPane(desk.board);
    } else {
      setDesk((current) => ({ ...current, collapsed: true }));
      selectPane(desk.study);
    }
  }
  function panels(items: Tabs, selected: string) {
    return items.map(([id]) => <div key={id} id={`desk-pane-${id}`} role="tabpanel"
      aria-labelledby={`desk-tab-${id === "review" ? "exercises" : id}`} tabIndex={0}
      className="desk-panel" hidden={id !== selected}>
      {desk.visited.includes(id) && <Suspense fallback={<p role="status">正在载入…</p>}>
        {renderPane(id)}
      </Suspense>}
    </div>);
  }
  const boardFocused = isBoard(desk.active);
  return <section className="desk-workbench" aria-label="学习书桌" data-side={boardFocused ? "board" : "study"}
    data-board-collapsed={desk.collapsed}>
    <div className="desk-mobile-switch" role="group" aria-label="书桌视图">
      <button type="button" aria-pressed={!boardFocused} aria-controls="desk-study"
        onClick={() => selectPane(desk.study)}><BookOpen size={15} />学习内容</button>
      <button type="button" aria-pressed={boardFocused} aria-controls="desk-board"
        onClick={() => selectPane(desk.board)}><Presentation size={15} />黑板</button>
    </div>
    <div className="desk-columns">
      <section id="desk-study" className="desk-column desk-study" aria-label="学习内容"
        onPointerDownCapture={() => focusPane(desk.study)} onFocusCapture={() => focusPane(desk.study)}>
        <div className="desk-tools">
          <div className="desk-tool-heading">
            <ModuleSelect unit={unit} select={select} />
            {desk.collapsed && <button ref={toggleButton} type="button" className="btn desk-collapse"
              aria-controls="desk-board" aria-expanded={false} onClick={toggleBoard}>
              <PanelRightOpen size={15} />展开黑板</button>}
          </div>
          <DeskTabs tabs={studyTabs} active={desk.study} select={selectPane} label="学习步骤" />
          {(desk.study === "exercises" || desk.study === "review") &&
            <div className="desk-practice-switch" role="group" aria-label="练习与复盘">
              <button type="button" aria-pressed={desk.study === "exercises"} onClick={() => selectPane("exercises")}>练习作答</button>
              <button type="button" aria-pressed={desk.study === "review"} onClick={() => selectPane("review")}>作答复盘</button>
            </div>}
        </div>
        {panels(studyPanes, desk.study)}
      </section>
      <section id="desk-board" className="desk-column desk-board" aria-label="黑板"
        onPointerDownCapture={() => focusPane(desk.board)} onFocusCapture={() => focusPane(desk.board)}>
        <div className="desk-tools">
          <div className="desk-tool-heading">
            <h2><Presentation size={18} />黑板</h2>
            <button ref={desk.collapsed ? undefined : toggleButton} type="button" className="btn desk-collapse" aria-controls="desk-board"
              aria-expanded={true} onClick={toggleBoard} title="收起黑板（专注单栏）">
              <PanelRightClose size={15} />收起黑板</button>
          </div>
          <DeskTabs tabs={boardTabs} active={desk.board} select={selectPane} label="黑板内容" />
        </div>
        {panels(boardTabs, desk.board)}
      </section>
    </div>
  </section>;
}
