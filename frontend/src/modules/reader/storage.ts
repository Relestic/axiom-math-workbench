export const DEMO_DOC_ID = "demo-analysis-v1";
export const DEMO_PDF_URL = "/demo/analysis-demo.pdf";

export type ReaderCase = "positive" | "negative" | "explore";

export type ReaderLink = {
  id: string;
  pageIndex: number;
  label: string;
  description: string;
  conceptId: string;
  caseId: ReaderCase;
  builtIn?: boolean;
};

export type StoredDocument = {
  key: string;
  userId: string;
  docId: string;
  name: string;
  fingerprint: string;
  size: number;
  lastModified: number;
  isDemo: boolean;
  blob: Blob;
};

export type ReadingState = {
  userId: string;
  docId: string;
  pageIndex: number;
  zoom: number;
  scrollTop: number;
  updatedAt: number;
};

const DB_NAME = "axiom-reader-v2";
const DB_VERSION = 1;
const FILES = "files";
const STATES = "states";
const LINKS = "links";
const LAST_PREFIX = "axiom-reader-last:";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持本地讲义持久保存"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILES))
        db.createObjectStore(FILES, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STATES))
        db.createObjectStore(STATES, { keyPath: "key" });
      if (!db.objectStoreNames.contains(LINKS))
        db.createObjectStore(LINKS, { keyPath: "docId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function docKey(userId: string, docId: string): string {
  return `${userId}:${docId}`;
}

export async function loadStoredDocument(
  userId: string,
): Promise<StoredDocument | null> {
  const last = localStorage.getItem(`${LAST_PREFIX}${userId}`);
  if (!last) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(FILES, "readonly");
    const value = await requestResult(
      tx.objectStore(FILES).get(last) as IDBRequest<StoredDocument | undefined>,
    );
    return value || null;
  } finally {
    db.close();
  }
}

export async function saveStoredDocument(
  document: Omit<StoredDocument, "key">,
): Promise<void> {
  const key = docKey(document.userId, document.docId);
  const db = await openDb();
  try {
    const tx = db.transaction(FILES, "readwrite");
    tx.objectStore(FILES).put({ ...document, key });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem(`${LAST_PREFIX}${document.userId}`, key);
  } finally {
    db.close();
  }
}

export async function loadReadingState(
  userId: string,
  docId: string,
): Promise<ReadingState | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STATES, "readonly");
    const value = await requestResult(
      tx.objectStore(STATES).get(docKey(userId, docId)) as IDBRequest<
        ReadingState | undefined
      >,
    );
    return value || null;
  } finally {
    db.close();
  }
}

export async function saveReadingState(state: ReadingState): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STATES, "readwrite");
    tx.objectStore(STATES).put({
      ...state,
      key: docKey(state.userId, state.docId),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadUserLinks(docId: string): Promise<ReaderLink[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(LINKS, "readonly");
    const value = await requestResult(
      tx.objectStore(LINKS).get(docId) as IDBRequest<
        { docId: string; links: ReaderLink[] } | undefined
      >,
    );
    return value?.links || [];
  } finally {
    db.close();
  }
}

export async function saveUserLinks(
  docId: string,
  links: ReaderLink[],
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(LINKS, "readwrite");
    tx.objectStore(LINKS).put({ docId, links });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function fingerprintBytes(data: ArrayBuffer): Promise<string> {
  if (!window.crypto?.subtle)
    throw new Error("当前浏览器无法计算讲义指纹，请使用较新的浏览器");
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function makeDocId(fingerprint: string): string {
  return `doc_${fingerprint.slice(0, 16)}`;
}

export async function fileToBuffer(file: Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export async function fetchDemoBuffer(): Promise<ArrayBuffer> {
  const response = await fetch(DEMO_PDF_URL);
  if (!response.ok) throw new Error("演示讲义加载失败，请检查安装文件");
  return response.arrayBuffer();
}
