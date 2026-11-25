import { useSyncExternalStore } from "react";

function subscribe(onThemeChange: () => void) {
  const observer = new MutationObserver(onThemeChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function usePlotTheme() {
  return useSyncExternalStore(subscribe, currentTheme);
}
