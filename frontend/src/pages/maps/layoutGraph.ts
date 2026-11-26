import type { GraphEdge, GraphNode } from "../../domain/types";

export const BUILTIN_LANE_ID = "builtin";
export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 64;
export const LANE_HEADER_HEIGHT = 48;
const COLUMN_STEP = 240;
const ROW_STEP = 88;
const LANE_PADDING = 16;
const LANE_GAP = 64;

export type LayoutBounds = { x: number; y: number; width: number; height: number };
export type LayoutNode = GraphNode & LayoutBounds & { layer: number; laneId: string };
export type LayoutLane = LayoutBounds & { id: string; title: string; nodeCount: number };
export type GraphLayout = {
  nodes: LayoutNode[];
  edges: GraphEdge[];
  lanes: LayoutLane[];
  bounds: LayoutBounds;
};

/** Iterative DFS visits each prerequisite once. Reverse finish order is topological
 * after edges back into the active path have been downgraded on the layout copy. */
function prerequisiteLayers(cards: GraphNode[], outgoing: Map<string, GraphEdge[]>) {
  const active = new Set<string>();
  const seen = new Set<string>();
  const finished: string[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    const stack = [{ id: card.id, cursor: 0 }];
    active.add(card.id);
    seen.add(card.id);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edge = outgoing.get(frame.id)?.[frame.cursor++];
      if (!edge) {
        finished.push(frame.id);
        active.delete(frame.id);
        stack.pop();
        continue;
      }
      const target = edge[1];
      if (active.has(target)) {
        edge[2] = "sequence";
      } else if (!seen.has(target)) {
        active.add(target);
        seen.add(target);
        stack.push({ id: target, cursor: 0 });
      }
    }
  }
  const layers = new Map<string, number>();
  for (const id of finished.reverse()) {
    const successorLayer = (layers.get(id) ?? 0) + 1;
    for (const [, target, relation] of outgoing.get(id) ?? []) {
      if (relation === "prerequisite") {
        layers.set(target, Math.max(layers.get(target) ?? 0, successorLayer));
      }
    }
  }
  return layers;
}

export function layoutGraph(sourceNodes: readonly GraphNode[], sourceEdges: readonly GraphEdge[]): GraphLayout {
  const groups = new Map<string, GraphNode[]>([[BUILTIN_LANE_ID, []]]);
  const laneById = new Map<string, string>();
  for (const node of sourceNodes) {
    if (node.kind === "case" || node.kind === "extension" || laneById.has(node.id)) continue;
    const laneId = node.textbookId ?? BUILTIN_LANE_ID;
    laneById.set(node.id, laneId);
    const cards = groups.get(laneId);
    if (cards) cards.push(node);
    else groups.set(laneId, [node]);
  }

  const edges: GraphEdge[] = [];
  const outgoing = new Map<string, GraphEdge[]>();
  for (const [from, to, relation] of sourceEdges) {
    if (relation === "case" || relation === "extension") continue;
    const laneId = laneById.get(from);
    if (laneId === undefined || laneById.get(to) !== laneId) continue;
    const edge: GraphEdge = [from, to, relation];
    edges.push(edge);
    if (relation === "prerequisite") {
      const siblings = outgoing.get(from);
      if (siblings) siblings.push(edge);
      else outgoing.set(from, [edge]);
    }
  }

  const nodes: LayoutNode[] = [];
  const lanes: LayoutLane[] = [];
  const bounds = { x: 0, y: 0, width: 0, height: 0 };
  for (const [laneId, cards] of groups) {
    if (!cards.length) continue;
    // Bootstrap order breaks page ties and preserves the course order of unpaged nodes.
    cards.sort((a, b) => (a.pageStart ?? 0) - (b.pageStart ?? 0));
    const layers = prerequisiteLayers(cards, outgoing);
    const rowCounts = new Map<number, number>();
    const top = lanes.length ? bounds.height + LANE_GAP : 0;
    let width = 0;
    let height = 0;
    for (const card of cards) {
      const layer = layers.get(card.id) ?? 0;
      const row = rowCounts.get(layer) ?? 0;
      rowCounts.set(layer, row + 1);
      const x = LANE_PADDING + layer * COLUMN_STEP;
      const y = top + LANE_HEADER_HEIGHT + row * ROW_STEP;
      nodes.push({ ...card, laneId, layer, x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
      width = Math.max(width, x + CARD_WIDTH + LANE_PADDING);
      height = Math.max(height, y - top + CARD_HEIGHT + LANE_PADDING);
    }
    const title = laneId === BUILTIN_LANE_ID ? "内置数学分析课程" : cards[0].textbookTitle ?? "本地教材";
    lanes.push({ id: laneId, title, x: 0, y: top, width, height, nodeCount: cards.length });
    bounds.width = Math.max(bounds.width, width);
    bounds.height = top + height;
  }
  // A downgraded prerequisite can now coincide with an authored sequence edge.
  const seenEdges = new Set<string>();
  const uniqueEdges = edges.filter(edge => {
    const key = JSON.stringify(edge);
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    return true;
  });
  return { nodes, edges: uniqueEdges, lanes, bounds };
}
