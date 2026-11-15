import type { ReaderLink } from "./storage";

export type ImageSource = {
  link: ReaderLink;
  documentName: string;
  pageIndex: number;
  pageCount: number;
  docId: string;
  isDemo: boolean;
  format?: "pdf" | "docx";
  blockId?: string;
  sectionTitle?: string;
  exactText?: string;
};

const IMAGE_SOURCE_KEY = "axiom-image-source";
const RETURN_STATE_KEY = "axiom-reader-return";
const FOCUS_LINK_KEY = "axiom-reader-focus-link";

export function rememberFocusedLink(linkId: string): void {
  try {
    sessionStorage.setItem(FOCUS_LINK_KEY, linkId);
  } catch {
    /* ignore */
  }
}

export function consumeFocusedLink(): string {
  try {
    const id = sessionStorage.getItem(FOCUS_LINK_KEY) || "";
    sessionStorage.removeItem(FOCUS_LINK_KEY);
    return id;
  } catch {
    return "";
  }
}

export function setImageSource(source: ImageSource): void {
  try {
    sessionStorage.setItem(IMAGE_SOURCE_KEY, JSON.stringify(source));
  } catch {
    /* navigation still works without storage */
  }
}

export function readImageSource(): ImageSource | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(IMAGE_SOURCE_KEY) || "null");
    if (!value || !value.link || typeof value.pageIndex !== "number") return null;
    return value as ImageSource;
  } catch {
    return null;
  }
}

export function clearImageSource(): void {
  try {
    sessionStorage.removeItem(IMAGE_SOURCE_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberReaderReturn(state: {
  docId: string;
  pageIndex: number;
  zoom: number;
  scrollTop: number;
}): void {
  try {
    sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function readReaderReturn(): {
  docId: string;
  pageIndex: number;
  zoom: number;
  scrollTop: number;
} | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RETURN_STATE_KEY) || "null");
    if (!value || typeof value.pageIndex !== "number") return null;
    return value;
  } catch {
    return null;
  }
}
