import { offlineEdges, offlineNodes } from "../../data/offline/graph";
import { conceptIdForGraphNode } from "../../domain/graphConcept";
import type { AppData, Attempt, CurriculumUnit, GraphNode, LocalBook } from "../../domain/types";

function practiceState(attempts: readonly Attempt[]) {
  if (!attempts.length) return { state: "unpracticed", progress: null };
  let latest = attempts[0];
  let scoreTotal = 0;
  let scoreCount = 0;
  for (const attempt of attempts) {
    if (Date.parse(attempt.createdAt) > Date.parse(latest.createdAt)) latest = attempt;
    const score = attempt.score;
    if (typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100) {
      scoreTotal += score;
      scoreCount++;
    }
  }
  return {
    state: latest.selfRating === "revisit" || latest.feedback?.correct === false ? "needs_review" : "practiced",
    progress: scoreCount ? Math.round(scoreTotal / scoreCount) : null,
  };
}

export function deriveOfflineGraph(
  units: readonly CurriculumUnit[], books: readonly LocalBook[], attempts: readonly Attempt[],
): AppData["graph"] {
  const nodes: GraphNode[] = offlineNodes.map(node => ({ ...node, conceptId: conceptIdForGraphNode(node.id) }));
  const edges = [...offlineEdges];
  const cardsByBook = new Map<string, CurriculumUnit[]>(books.map(book => [book.id, []]));
  const knownIds = new Set(nodes.map(node => node.id));
  for (const unit of units) {
    const cards = unit.textbookSource && cardsByBook.get(unit.textbookSource.textbookId);
    if (cards && !knownIds.has(unit.id)) {
      cards.push(unit);
      knownIds.add(unit.id);
    }
  }
  const attemptsByTopic = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const attemptsForTopic = attemptsByTopic.get(attempt.topicId);
    if (attemptsForTopic) attemptsForTopic.push(attempt);
    else attemptsByTopic.set(attempt.topicId, [attempt]);
  }

  let position = 0;
  for (const book of books) {
    // bootstrap-extras returns creation order. Stable sort keeps that order for page ties.
    const cards = cardsByBook.get(book.id)!;
    cards.sort((a, b) => a.textbookSource!.pageStart - b.textbookSource!.pageStart);
    const localNodes = new Map<string, GraphNode>();
    for (const unit of cards) {
      const node: GraphNode = {
        id: unit.id, conceptId: unit.id, name: unit.title,
        textbookId: book.id, textbookTitle: book.title, pageStart: unit.textbookSource!.pageStart,
        detail: unit.definition, description: book.title, prerequisites: [], connections: [],
        x: 90 + (position % 5) * 170, y: 68 - Math.floor(position / 5) * 75, color: "#55b9cb",
        ...practiceState(attemptsByTopic.get(unit.id) ?? []),
      };
      position++;
      localNodes.set(unit.id, node);
      nodes.push(node);
    }
    for (const [index, unit] of cards.entries()) {
      const node = localNodes.get(unit.id)!;
      for (const id of new Set(unit.prerequisites)) {
        const prerequisite = localNodes.get(id);
        if (!prerequisite || prerequisite === node) continue;
        edges.push([id, node.id, "prerequisite"]);
        node.prerequisites.push(prerequisite.name);
        prerequisite.connections.push(node.name);
      }
      if (!node.prerequisites.length && index > 0) {
        edges.push([cards[index - 1].id, node.id, "sequence"]);
      }
    }
  }
  return { nodes, edges };
}
