"""PDF inspection with optional extraction.

The review environment does not ship pdfplumber. Rather than pretending to parse
formulas, this adapter reports exactly which stage is available: file validation,
page-count estimation, and text extraction only when an optional extractor is
installed. Admin can always import reviewed text explicitly.
"""

from __future__ import annotations

import re
from typing import Any

PAGE_RE = re.compile(rb"/Type\s*/Page\b")
COUNT_RE = re.compile(rb"/Count\s+(\d+)")


def available_extractor() -> str | None:
    try:
        import pdfplumber  # type: ignore

        return "pdfplumber"
    except Exception:
        pass
    try:
        import pypdf  # type: ignore

        return "pypdf"
    except Exception:
        return None


def inspect_pdf(data: bytes) -> dict[str, Any]:
    pages = len(PAGE_RE.findall(data))
    counts = [int(match.group(1)) for match in COUNT_RE.findall(data)]
    estimated = max(pages, max(counts) if counts else 0)
    extractor = available_extractor()
    return {
        "magic_ok": data.startswith(b"%PDF-"),
        "size_bytes": len(data),
        "page_count_estimate": estimated or None,
        "counts_entries": counts[:10],
        "extractor": extractor,
        "extraction_available": extractor is not None,
        "text": None,
        "note": (
            f"使用 {extractor} 提取文本。"
            if extractor
            else "未安装 PDF 文本提取器；文件已保存并通过结构检查。请管理员粘贴/导入已核对文本，"
            "或安装可选依赖 pdfplumber 后重试。"
        ),
    }


def extract_text(path: str) -> tuple[str | None, str | None]:
    extractor = available_extractor()
    if extractor == "pdfplumber":
        try:
            import pdfplumber  # type: ignore

            chunks = []
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages:
                    chunks.append(page.extract_text() or "")
            return "\n\n".join(chunks), None
        except Exception as exc:
            return None, f"pdfplumber 提取失败：{exc}"
    if extractor == "pypdf":
        try:
            from pypdf import PdfReader  # type: ignore

            reader = PdfReader(path)
            return "\n\n".join((page.extract_text() or "") for page in reader.pages), None
        except Exception as exc:
            return None, f"pypdf 提取失败：{exc}"
    return None, "没有可用的 PDF 文本提取器"
