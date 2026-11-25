import { apiUrl } from "../../lib/api";
import {
  replaceLearningStorage,
  validateLearningStorage,
  type LearningStorage,
} from "./archiveStorage";

export {
  exportBrowserArchive,
  readBrowserArchive,
  readLearningStorage,
  replaceLearningStorage,
  validateLearningStorage,
} from "./archiveStorage";

const endpoint = "/api/v1/archive";
export class ArchiveUnavailable extends Error {}

async function archiveRequest(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(apiUrl(`${endpoint}/${path}`), init);
  } catch {
    throw new ArchiveUnavailable("无法连接本地 Python 服务。");
  }
  const isJson = response.headers
    .get("Content-Type")
    ?.includes("application/json");
  if (
    [404, 405, 501].includes(response.status) ||
    (!isJson && response.headers.get("Content-Type")?.includes("text/html"))
  ) {
    throw new ArchiveUnavailable("当前服务未提供完整存档功能。");
  }
  if (!response.ok) {
    const data = isJson ? await response.json().catch(() => null) : null;
    throw new Error(
      data?.error?.message || `存档请求失败（HTTP ${response.status}）。`,
    );
  }
  return response;
}

export async function exportFullArchive(
  storage: LearningStorage,
): Promise<Blob> {
  const response = await archiveRequest("export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storage }),
  });
  if (!response.headers.get("Content-Type")?.includes("application/zip")) {
    throw new ArchiveUnavailable("当前服务未提供完整存档功能。");
  }
  return response.blob();
}

export async function prepareFullArchive(file: File) {
  const payload = new FormData();
  payload.append("archive", file);
  const init = { method: "POST", body: payload };
  const response = await archiveRequest("import?validate=1", init);
  const preview = await response.json();
  const storage = validateLearningStorage(preview?.storage);
  return async () => {
    const rollback = replaceLearningStorage(storage);
    try {
      const result = await archiveRequest("import", init);
      const data = await result.json();
      if (data?.ok !== true) throw new Error("服务未确认存档导入成功。");
    } catch (cause) {
      try {
        rollback();
      } catch {
        throw new Error("导入未完成，浏览器上的原有学习记录无法恢复。");
      }
      throw cause;
    }
  };
}
