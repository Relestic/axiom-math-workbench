import { useLayoutEffect, useMemo, useState } from "react";
import type { CurriculumUnit } from "../../domain/types";
import { initialScene } from "../../lib/plotScene";
import { dirichlet } from "./diagram/presets";
import { defaultSurfaceScene } from "./three-d/types";
import { readCardEdits, saveCardEdits, sceneField, type CardEdits, type CardVisual } from "./cardVisual";

const defaults = {functionScene:initialScene, surfaceScene:defaultSurfaceScene, diagramScene:dirichlet};

export function useCardBoards(id: string, unit: CurriculumUnit | undefined) {
  const [session, setSession] = useState(() => new Map<string, CardEdits>());
  const stored = useMemo(() => readCardEdits(id), [id]);
  const edits = session.get(id) ?? stored;
  const [generation, setGeneration] = useState<{id:string; visual:CardVisual}>();
  const visual = generation?.id === id ? generation.visual : unit?.visual;
  const [revision, setRevision] = useState(0);
  const [storageError, setStorageError] = useState("");
  useLayoutEffect(() => {
    if (!unit) return;
    try {
      saveCardEdits(id, edits);
      setStorageError("");
    } catch { setStorageError("浏览器无法保存配图修改，当前会话仍可使用。"); }
  }, [id, Boolean(unit), edits]);
  function remember(update: CardVisual) {
    setSession(previous => {
      const next: CardEdits = {...(previous.get(id) ?? stored), ...update};
      const field = sceneField[update.board];
      if (JSON.stringify(update[field]) === JSON.stringify(visual?.[field] ?? defaults[field])) {
        delete next[field];
        next.board = (Object.keys(sceneField) as (keyof typeof sceneField)[]).find(board => next[sceneField[board]]);
      }
      return new Map(previous).set(id, next);
    });
  }
  function reset() {
    setSession(previous => new Map(previous).set(id, {}));
    setRevision(n => n + 1);
  }
  return {visual, edits, storageError, reset, remember, scenes:{...visual, ...edits},
    setDefault: (value: CardVisual) => { setGeneration({id, visual:value}); reset(); },
    // Remount editors (including their draft and undo stacks) only on a card/default change or reset.
    editorKey: JSON.stringify([id, visual ?? null, revision]),
  };
}
