import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function navigate(path: string) {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

export function usePath() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
}
