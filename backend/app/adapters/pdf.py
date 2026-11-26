"""Inspect local PDFs once and preserve page boundaries for source citations."""

import io

from pypdf import PdfReader

from ..errors import ApiError


def page_data(data: bytes) -> dict:
    try:
        with PdfReader(io.BytesIO(data)) as reader:
            if reader.is_encrypted:
                raise ApiError("unprocessable", "请先解除 PDF 密码保护")
            pages = []
            for number, page in enumerate(reader.pages, 1):
                try:
                    text = (page.extract_text() or "").strip()
                except Exception:
                    text = ""
                readable = sum(ch.isalnum() for ch in text)
                pages.append(
                    {"page": number, "text": text, "char_count": readable, "needs_ocr": readable < 5}
                )
            if not pages:
                raise ApiError("unprocessable", "PDF 没有可阅读的页面")
            outline = []
            try:
                pending = list(reversed(reader.outline))
                while pending:
                    item = pending.pop()
                    if isinstance(item, list):
                        pending.extend(reversed(item))
                        continue
                    index = reader.get_destination_page_number(item)
                    if index is not None and 0 <= index < len(pages):
                        outline.append({"title": str(item.title), "page": index + 1})
            except Exception:
                pass  # A damaged bookmark tree does not invalidate the pages.
            return {"extractor": "pypdf", "page_count": len(pages), "pages": pages, "outline": outline}
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError("unprocessable", "无法读取 PDF 结构，请检查文件是否完整") from exc
