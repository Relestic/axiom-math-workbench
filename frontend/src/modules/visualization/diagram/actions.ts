import type { WorkspaceAction } from "../../../app/workspaceEndpoints";
import { applySceneActions } from "../scene/companionActions";
import { diagramSceneSchema, type DiagramScene } from "./schema";

function compose(scene: DiagramScene, action: WorkspaceAction): DiagramScene {
  switch (action.type) {
    case "set_diagram": {
      if (!action.scene.nodes.length || action.scene.nodes.length > 16) throw new Error("一次绘制需要 1–16 个图元");
      return diagramSceneSchema.parse(action.scene);
    }
    case "set_diagram_view": return diagramSceneSchema.parse({ ...scene, viewBox: action.viewBox });
    case "remove_diagram_node": {
      const nodes = scene.nodes.filter(node => node.id !== action.id);
      if (nodes.length === scene.nodes.length) throw new Error("指定的图元不存在");
      return { ...scene, nodes };
    }
    case "upsert_diagram_node": {
      const node = action.node;
      const nodes = scene.nodes.some(item => item.id === node.id)
        ? scene.nodes.map(item => item.id === node.id ? node : item) : [...scene.nodes, node];
      if (nodes.length > 24) throw new Error("每幅图解最多使用 24 个图元");
      return diagramSceneSchema.parse({ ...scene, nodes });
    }
    default: throw new Error("这项操作不适用于文字图解");
  }
}
export function applyDiagramActions(scene: DiagramScene, actions: readonly WorkspaceAction[], commit: (next: DiagramScene) => void) {
  return applySceneActions(scene, actions, compose, commit);
}
