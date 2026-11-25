import { useCallback, useState } from "react";
import type { DataSource } from "../../../domain/types";

const STORAGE_KEY = "axiom-offline-concept";

function readOfflineConcept(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "uniform";
  } catch {
    return "uniform";
  }
}

export function useSelectedConcept(source: DataSource) {
  const [selectedConceptId, setSelectedConceptId] =
    useState(readOfflineConcept);

  const selectConcept = useCallback(
    (id: string) => {
      setSelectedConceptId(id);
      if (source === "offline") {
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* The selection remains available in the open workbench. */
        }
      }
    },
    [source],
  );

  const selectServerConcept = useCallback(
    (ids: string[], preferred: string | null) => {
      const offlineConcept = readOfflineConcept();
      setSelectedConceptId(
        (preferred && ids.includes(preferred) ? preferred : undefined) ||
          (ids.includes(offlineConcept) ? offlineConcept : ids[0]) ||
          "uniform",
      );
    },
    [],
  );

  return { selectedConceptId, selectConcept, selectServerConcept };
}
