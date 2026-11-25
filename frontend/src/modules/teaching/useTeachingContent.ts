import { useCallback, useState } from "react";
import {
  offlineClassics,
  offlineCurriculum,
  offlineSources,
} from "../../data/offline";
import type { DataBundleDto } from "../../domain/dto";
import { buildUnits, mapClassicSets } from "../../domain/mappers";
import type { AppData, DataSource, Exercise } from "../../domain/types";

const offlineContent = { units: offlineCurriculum, classics: offlineClassics };

export function useTeachingContent(source: DataSource) {
  const [serverContent, setServerContent] = useState<
    Pick<AppData, "units" | "classics">
  >({
    units: [],
    classics: [],
  });

  const loadServer = useCallback(
    (
      bundle: Pick<DataBundleDto, "catalog" | "details">,
      exercises: Exercise[],
    ) => {
      const units = buildUnits(
        bundle.catalog,
        bundle.details,
        exercises,
        bundle.catalog.tools,
        offlineSources,
      );
      setServerContent({
        units,
        classics: mapClassicSets(
          new Map(bundle.details.map((detail) => [detail.id, detail])),
          offlineClassics,
        ),
      });
      return units;
    },
    [],
  );

  return {
    ...(source === "server" ? serverContent : offlineContent),
    loadServer,
  };
}
