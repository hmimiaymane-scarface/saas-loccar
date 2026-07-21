/**
 * Roadmap phase 10 requirement 1 — "PDF text extraction is the safer
 * starting point" per the phase brief's own guidance over parsing
 * Word documents. Deliberately a separate, PDF-only pipeline from
 * phase 03/04's `lib/document-extraction.ts` vision pipeline (which
 * explicitly excludes PDF — see `prepareVisionCall`'s
 * `unsupported_file_type` message): a contract template is a text
 * document to be read, not a photo to be looked at.
 */
import pdfParse from "pdf-parse"

export interface PdfExtractResult {
  ok: boolean
  text: string
}

/** Returns ok:false (not a throw) when the PDF has no extractable text
 * at all — a scanned image-only PDF with no text layer, for instance.
 * That's a real, expected failure mode for this pipeline, not a bug. */
export async function extractPdfText(fileBytes: Buffer): Promise<PdfExtractResult> {
  const result = await pdfParse(fileBytes)
  const text = result.text.trim()
  return { ok: text.length > 0, text }
}
