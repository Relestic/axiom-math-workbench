import { useSyncExternalStore } from "react";
import { variantCode } from "./review";

function subscribe(listener: () => void) {
  window.addEventListener("axiom:exercise-selection",listener);
  window.addEventListener("storage",listener);
  return () => {
    window.removeEventListener("axiom:exercise-selection",listener);
    window.removeEventListener("storage",listener);
  };
}

export function selectExercise(topic:string, value:string) {
  if (!/^[2-5]$/.test(value) && !variantCode.test(value)) return;
  localStorage.setItem("axiom-exercise-variant-" + topic, value);
  window.dispatchEvent(new Event("axiom:exercise-selection"));
}
export function useExerciseSelection(topic:string) {
  return useSyncExternalStore(subscribe, () => localStorage.getItem("axiom-exercise-variant-" + topic) || "2");
}
