import type { Props } from "./shared";
import { WordReaderPage } from "../WordReaderPage";

/**
 * The textbook page is now the Word-original reader.
 * The PDF reader remains available as a hidden legacy route.
 */
export function Textbook({ onNavigate, notify }: Props) {
  return <WordReaderPage onNavigate={onNavigate} notify={notify} />;
}
