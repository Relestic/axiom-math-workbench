import { createContext, useContext } from "react";
import type { CardScenes, CardVisual } from "./cardVisual";

type Binding = {
  scenes: CardScenes;
  remember: (visual: CardVisual) => void;
};
export const CardBoardContext = createContext<Binding | null>(null);
export const useCardBoard = () => useContext(CardBoardContext);
