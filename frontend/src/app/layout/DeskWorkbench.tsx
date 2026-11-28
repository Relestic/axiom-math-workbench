import type { DeskPanes } from "../../modules/companion/workspace";
import { Suspense, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, PanelRightClose, PanelRightOpen, Presentation } from "lucide-react";
import { CardGenerationButton, DeskCardNavigation } from "../../pages/learning/shared";
import { useAppData } from "../DataProvider";
import { generateCardVisual } from "../../modules/teaching/localTextbooks";
import { useCardEnrichment } from "../../modules/teaching/useCardEnrichment";
import type { CurriculumUnit } from "../../domain/types";
import { cardVisualSchema, sceneField } from "../../modules/visualization/cardVisual";
import { MathText } from "../../components/Math";
import { useCardBoards } from "../../modules/visualization/useCardBoards";
import { CardBoardContext } from "../../modules/visualization/cardBoardContext";
import "./desk.css";

const studyTabs = [
  ["textbook", "讲义定义"], ["proof", "证明思路"],
  ["exercises", "练习与复盘"],
] as const;
const boardTabs = [
  ["explore", "2D 函数"], ["surface", "3D 曲面"], ["diagram", "文字图解"], ["pdf", "课本原文"],
] as const;
const studyPanes = [...studyTabs, ["review", "作答复盘"]] as const;
type Tabs = ReadonlyArray<readonly [string, string]>;

function isBoard(id: string) {
  return boardTabs.some(([value]) => value === id);
}

function CardEnrichmentBar({ unit }: { unit: CurriculumUnit }) {
  const card = useCardEnrichment(unit);
  return <div className="desk-enrichment" role="group" aria-label="本卡精配">
    <label><input type="checkbox" checked={card.autoEnrich}
      onChange={event => card.toggle(event.target.checked)} />翻到卡片自动精配</label>
    {card.complete ? <span role="status">✓ 本卡证明 · 练习 · 配图已配齐</span> :
      <button type="button" className="btn" disabled={!!card.busy || !card.configured}
        onClick={card.generate}>一键精配本卡</button>}
    {card.busy && <span role="status">{card.busy === "automatic" ?
      "正在为本卡自动补齐证明、练习与配图…" : "正在精配本卡…"}</span>}
    {!card.complete && !card.busy && card.error && <small role="alert">{card.error}</small>}
  </div>;
}

function DeskTabs({ tabs, active, label, select }: {
  tabs: Tabs;
  active: string;
  label: string;
  select: (id: string) => void;
}) {
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey) return;
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

type DeskSelection = DeskPanes & {
  route: string;
  active: string;
  visited: string[];
};

function openRoute(pane: string, previous?: DeskSelection, initialBoard = "explore"): DeskSelection {
  const board = isBoard(pane) ? pane : previous?.board ?? initialBoard;
  const study = isBoard(pane) ? previous?.study ?? "textbook" : pane;
  return {
    route: pane, study, board, active: pane,
    collapsed: !isBoard(pane) && (previous?.collapsed ?? false),
    visited: [...new Set([...(previous?.visited ?? []), study, board])],
  };
}

export function DeskWorkbench({ pane, initialBoard, navigate, renderPane, onActivePane, onPanesChange }: {
  pane: string;
  initialBoard: "explore" | "pdf";
  navigate: (id: string) => void;
  renderPane: (id: string) => ReactNode;
  onActivePane: (id: string) => void;
  onPanesChange: (panes: DeskPanes) => void;
}) {
  const { selectedConceptId, data, refreshLocal } = useAppData();
  const unit = data.units.find(item => item.id === selectedConceptId);
  const boards = useCardBoards(selectedConceptId, unit);
  const associated = boards.edits.board ?? boards.visual?.board;
  const [desk, setDesk] = useState(() => openRoute(pane, undefined,
    initialBoard === "pdf" ? "pdf" : boards.visual?.board ?? associated ?? initialBoard));
  const seenCard = useRef(unit?.id);
  const seenBoard = useRef(associated);
  const explicitBoardCard = useRef(isBoard(pane) ? selectedConceptId : "");
  const selectedId = useRef(selectedConceptId);
  useLayoutEffect(() => { selectedId.current = selectedConceptId; }, [selectedConceptId]);
  useLayoutEffect(() => () => { selectedId.current = ""; }, []);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  if (pane !== desk.route) setDesk(openRoute(pane, desk));
  // Explicit tabs and Hiyori reveals win until the learner changes cards.
  useLayoutEffect(() => {
    if (!unit) return;
    const sameCard = unit.id === seenCard.current;
    const newBoard = !seenBoard.current && associated;
    seenBoard.current = associated;
    if (sameCard && (!newBoard || explicitBoardCard.current === unit.id)) return;
    const initialLoad = !seenCard.current;
    seenCard.current = unit.id;
    if (!associated || desk.board === "pdf" || (initialLoad && (isBoard(pane) || explicitBoardCard.current === unit.id))) return;
    if (isBoard(pane) && pane !== associated) navigate(associated);
    else showBoard(associated);
  }, [unit?.id, associated]);
  useLayoutEffect(() => {
    onPanesChange({ study: desk.study, board: desk.board, collapsed: desk.collapsed });
  }, [desk.study, desk.board, desk.collapsed, onPanesChange]);

  useLayoutEffect(() => {
    function reveal(event: Event) {
      const target = (event as CustomEvent<{pane: string}>).detail?.pane;
      if (!target || !isBoard(target)) return;
      explicitBoardCard.current = selectedId.current;
      setDesk(current => ({
        ...current, board: target, active: target, collapsed: false,
        visited: current.visited.includes(target) ? current.visited : [...current.visited, target],
      }));
    }
    window.addEventListener("axiom:reveal-pane", reveal);
    return () => window.removeEventListener("axiom:reveal-pane", reveal);
  }, []);
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
  function showBoard(id: string) {
    setDesk(current => ({ ...current, board: id, active: isBoard(current.active) ? id : current.active,
      visited: [...new Set([...current.visited, id])] }));
  }
  function selectPane(id: string) {
    focusPane(id);
    if (isBoard(id)) { explicitBoardCard.current = selectedConceptId; showBoard(id); }
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
            <DeskCardNavigation />
            {desk.collapsed && <button ref={toggleButton} type="button" className="btn desk-collapse"
              aria-controls="desk-board" aria-expanded={false} onClick={toggleBoard}>
              <PanelRightOpen size={15} />展开黑板</button>}
          </div>
          {unit?.textbookSource && <CardEnrichmentBar key={unit.id} unit={unit} />}
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
          {unit && <div className="desk-card-association" key={unit.id}>
            {(boards.visual || associated) && <span>已对应卡片：《{unit.title}》</span>}
            {boards.visual && <button type="button" className="btn" disabled={!Object.values(boards.edits).some(Boolean)}
              onClick={() => { boards.reset(); selectPane(boards.visual!.board); }}>重置为本卡默认配图</button>}
            {boards.visual?.summary && desk.board === boards.visual.board && !boards.edits[sceneField[boards.visual.board]] &&
              <small className="desk-visual-summary"><MathText>{boards.visual.summary}</MathText></small>}
            {!boards.visual && unit.textbookSource && <>
              <span>当前卡片尚未绑定专属图像</span>
              <CardGenerationButton label="AI 生成本卡配套图像" generate={async () => {
                const result = await generateCardVisual(unit.id);
                const visual = cardVisualSchema.parse(result.visual);
                if (selectedId.current === unit.id) {
                  boards.setDefault(visual);
                  selectPane(visual.board);
                }
                await refreshLocal();
              }}/>
            </>}
            {boards.storageError && <small role="alert">{boards.storageError}</small>}
          </div>}
        </div>
        <CardBoardContext.Provider value={boards} key={boards.editorKey}>
          {panels(boardTabs.filter(([id]) => id !== "pdf"), desk.board)}
        </CardBoardContext.Provider>
        {panels(boardTabs.filter(([id]) => id === "pdf"), desk.board)}
      </section>
    </div>
  </section>;
}
