// Extract plain text from a PDF entirely in the browser. pdfjs-dist is loaded
// on demand (dynamic import) so it lands in its own chunk and never bloats the
// main bundle. Works offline in the PWA — no network round-trip for parsing.
const MAX_PAGES = 20

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await loadingTask.promise
  try {
    const parts: string[] = []
    const pages = Math.min(doc.numPages, MAX_PAGES)
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      parts.push(
        content.items
          .map((i) => ('str' in i ? i.str : ''))
          .join(' ')
      )
    }
    return parts.join('\n').trim()
  } finally {
    await loadingTask.destroy()
  }
}
