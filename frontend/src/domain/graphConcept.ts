const courseTargets = new Map<string, string>([
  ["real", "continuous"],
  ["sequence", "continuous"],
  ["limit", "continuous"],
  ["continuity", "continuous"],
  ["compact", "uniform"],
  ["mvt", "mean-value"],
  ["bounded", "mean-value"],
  ["lipschitz", "uniform"],
  ["abs", "derivative"],
  ["reciprocal", "uniform"],
  ["ftc", "integral"],
]);

export function conceptIdForGraphNode(nodeId: string): string {
  return courseTargets.get(nodeId) ?? nodeId;
}
