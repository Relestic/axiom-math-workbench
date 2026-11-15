import type { Props } from "./shared";
import { ReaderPage } from "../ReaderPage";

/**
 * The textbook page is now the original-PDF reader.
 * Re-authored knowledge cards were removed from the normal learning flow.
 */
export function Textbook({ onNavigate, notify }: Props) {
  return <ReaderPage onNavigate={onNavigate} notify={notify} />;
}
