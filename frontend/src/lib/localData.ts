import { useCallback, useEffect, useState } from "react";

function readLocalData<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function useLocalData<T>(key: string, fallback: T) {
  const read = useCallback(() => {
    const saved = readLocalData(key, fallback);
    return Array.isArray(fallback) && !Array.isArray(saved) ? fallback : saved;
  }, [key, fallback]);

  const [value, setValue] = useState(read);

  const write = useCallback(
    (update: (current: T) => T) => {
      const next = update(read());
      localStorage.setItem(key, JSON.stringify(next));
      setValue(next);
    },
    [key, read],
  );

  const reload = useCallback(() => setValue(read()), [read]);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === key || event.key === null) reload();
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, reload]);

  return { value, write, reload };
}
