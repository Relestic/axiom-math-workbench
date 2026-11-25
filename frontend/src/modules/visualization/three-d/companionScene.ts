import { normalizeSurfaceScene } from "./engine";
import type { SurfaceScene } from "./types";

const viewControls = ["azimuth", "elevation", "heightScale", "zoom"] as const;

export function surfaceParameterHints(scene: SurfaceScene) {
  return { ...scene.view, opacity: scene.display.opacity };
}

export function surfaceParameterCandidate(
  scene: SurfaceScene,
  name: string,
  value: number,
): SurfaceScene | null {
  if (!Number.isFinite(value)) return null;
  const viewControl = viewControls.find((control) => control === name);
  try {
    if (viewControl && scene.view[viewControl] !== value) {
      const candidate = normalizeSurfaceScene({
        ...scene,
        view: { ...scene.view, [viewControl]: value },
      });
      if (candidate.view[viewControl] === value) return candidate;
    }
    if (name === "opacity" && scene.display.opacity !== value) {
      const candidate = normalizeSurfaceScene({
        ...scene,
        display: { ...scene.display, opacity: value },
      });
      if (candidate.display.opacity === value) return candidate;
    }
  } catch {
    // Retain the current scene when validation rejects a suggestion.
  }
  return null;
}
