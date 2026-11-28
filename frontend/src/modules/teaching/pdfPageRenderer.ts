export type OCRPageImage = { page: number; image_data_url: string };

async function loadDocument(source: string | Uint8Array) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const assets = import.meta.env.DEV
    ? "/node_modules/pdfjs-dist/"
    : `${import.meta.env.BASE_URL}assets/pdfjs/`;
  return pdfjs.getDocument({
    ...(typeof source === "string" ? { url: source } : { data: source }),
    cMapUrl: assets + "cmaps/",
    standardFontDataUrl: assets + "standard_fonts/",
    wasmUrl: assets + "wasm/",
    disableWorkerRendering: true,
    stopAtErrors: true,
  });
}

type RenderPages = (pageNumbers: readonly number[]) => Promise<OCRPageImage[]>;

export async function withPdfPageRenderer<T>(source: string | Uint8Array, use: (render: RenderPages) => Promise<T>) {
  // A whole-book run shares one PDF and worker. Text-only books never open either.
  let loading: ReturnType<typeof loadDocument> | undefined;
  const render: RenderPages = async pageNumbers => {
    const task = await (loading ??= loadDocument(source));
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
  };
  try {
    return await use(render);
  } finally {
    const task = await loading;
    await task?.destroy();
  }
}

export function renderPdfPages(source: string | Uint8Array, pageNumbers: readonly number[]) {
  return withPdfPageRenderer(source, render => render(pageNumbers));
}
