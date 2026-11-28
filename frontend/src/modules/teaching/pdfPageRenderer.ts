export type OCRPageImage = { page: number; image_data_url: string };

export async function renderPdfPages(
  source: string | Uint8Array,
  pageNumbers: readonly number[],
): Promise<OCRPageImage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const assets = import.meta.env.DEV
    ? "/node_modules/pdfjs-dist/"
    : `${import.meta.env.BASE_URL}assets/pdfjs/`;
  const task = pdfjs.getDocument({
    ...(typeof source === "string" ? { url: source } : { data: source }),
    cMapUrl: assets + "cmaps/",
    standardFontDataUrl: assets + "standard_fonts/",
    wasmUrl: assets + "wasm/",
    disableWorkerRendering: true,
    stopAtErrors: true,
  });
  try {
    const pdf = await task.promise;
    const images: OCRPageImage[] = [];
    for (const number of pageNumbers) {
      const page = await pdf.getPage(number);
      const canvas = document.createElement("canvas");
      try {
        const size = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 1600 / Math.max(size.width, size.height) });
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        await page.render({ canvas, viewport, background: "white" }).promise;
        images.push({ page: number, image_data_url: canvas.toDataURL("image/jpeg", 0.82) });
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return images;
  } finally {
    // PDF.js 6 disposes the document and its worker through the loading task.
    await task.destroy();
  }
}
