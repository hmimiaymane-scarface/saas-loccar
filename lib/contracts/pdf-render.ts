import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"

import type { RenderedSection } from "@/lib/contracts/template-engine"

/**
 * Roadmap phase 10 requirement 3 — "the PDF [is] a regeneratable
 * rendering of that data, not the source of truth." Renders a clean,
 * simple, single-column A4 document from already-resolved sections —
 * deliberately NOT an attempt to visually clone the uploaded original
 * template's layout (fonts, columns, letterhead positioning). That
 * would need real document-layout preservation, well beyond this
 * phase's scope; the uploaded original's job was supplying section
 * text and letting the AI identify variables, not being pixel-cloned.
 * See docs/contracts.md.
 *
 * Pure w.r.t. its inputs (no Supabase, no filesystem) — given the same
 * branding + sections, always produces the same bytes, which is the
 * concrete proof behind "regeneratable": `regenerateContractPdf` in
 * `lib/contracts/template-store.ts` calls this again from the
 * contract's already-stored `resolved_context`/`rendered_sections`
 * rather than ever needing the original upload again.
 *
 * Roadmap phase 11 requirement 6 extends this with a contract number
 * and embedded PDF metadata linking back to the contract's own id —
 * "fast, consistent, versioned, immutable" was already true from
 * phase 10; this phase adds the "metadata linking back to the
 * structured contract record" half.
 */

export interface ContractPdfBranding {
  companyName: string
  companyAddress: string | null
  companyCity: string | null
  companyCountry: string
  companyTaxId: string | null
}

export interface ContractPdfInput {
  reservationReference: string
  branding: ContractPdfBranding
  sections: RenderedSection[]
  legalFooterText: string | null
  generatedAtLabel: string
  /** Roadmap phase 11 requirement 6 — "metadata linking back to the
   * structured contract record": embedded into the PDF's own document
   * metadata (Title/Subject/Keywords), not just printed as visible
   * text, so the file itself carries a durable link back to its
   * database row even outside this app. */
  contractId: string
  contractNumber: string
}

const PAGE_WIDTH = 595.28 // A4 at 72dpi
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BODY_SIZE = 10
const LINE_HEIGHT = 14

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    let current = ""
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }
  return lines
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Rental Agreement ${input.contractNumber}`)
  doc.setSubject(`contract:${input.contractId}`)
  doc.setKeywords([input.contractNumber, input.contractId])
  doc.setProducer("RentalOS")
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let cursorY = PAGE_HEIGHT - MARGIN

  function newPageIfNeeded(neededHeight: number) {
    if (cursorY - neededHeight < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      cursorY = PAGE_HEIGHT - MARGIN
    }
  }

  function drawLine(text: string, font: PDFFont, size: number, gapAfter = 0) {
    newPageIfNeeded(LINE_HEIGHT)
    page.drawText(text, { x: MARGIN, y: cursorY, size, font, color: rgb(0.1, 0.1, 0.1) })
    cursorY -= LINE_HEIGHT + gapAfter
  }

  function drawParagraph(text: string, font: PDFFont, size: number) {
    for (const line of wrapText(text, font, size, CONTENT_WIDTH)) {
      newPageIfNeeded(LINE_HEIGHT)
      drawLine(line, font, size)
    }
  }

  drawLine(input.branding.companyName, bold, 14, 4)
  const addressParts = [input.branding.companyAddress, input.branding.companyCity, input.branding.companyCountry].filter(Boolean)
  if (addressParts.length > 0) drawLine(addressParts.join(", "), regular, BODY_SIZE)
  if (input.branding.companyTaxId) drawLine(`Tax ID: ${input.branding.companyTaxId}`, regular, BODY_SIZE)
  cursorY -= 10

  drawLine(`Rental Agreement ${input.contractNumber} — ${input.reservationReference}`, bold, 13, 2)
  drawLine(`Generated ${input.generatedAtLabel}`, regular, 9, 14)

  for (const section of input.sections) {
    newPageIfNeeded(LINE_HEIGHT * 2)
    drawLine(section.title, bold, 11, 4)
    drawParagraph(section.body, regular, BODY_SIZE)
    cursorY -= 10
  }

  if (input.legalFooterText) {
    cursorY -= 6
    drawParagraph(input.legalFooterText, regular, 8)
  }

  return doc.save()
}
