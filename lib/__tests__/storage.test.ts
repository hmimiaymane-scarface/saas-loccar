import { describe, expect, it } from "vitest"

import { validateFile, validateUploadForCompany, MAX_FILE_SIZE_BYTES, ACCEPTED_DOCUMENT_MIME_TYPES } from "../storage"

describe("validateFile", () => {
  it("accepts a normal file", () => {
    expect(validateFile({ type: "application/pdf", size: 1024 }, ACCEPTED_DOCUMENT_MIME_TYPES)).toBeNull()
  })

  it("rejects an empty file", () => {
    expect(validateFile({ type: "application/pdf", size: 0 }, ACCEPTED_DOCUMENT_MIME_TYPES)).not.toBeNull()
  })

  it("rejects a file over the size limit", () => {
    expect(
      validateFile({ type: "application/pdf", size: MAX_FILE_SIZE_BYTES + 1 }, ACCEPTED_DOCUMENT_MIME_TYPES)
    ).not.toBeNull()
  })

  it("rejects a disallowed mime type", () => {
    expect(validateFile({ type: "application/x-msdownload", size: 1024 }, ACCEPTED_DOCUMENT_MIME_TYPES)).not.toBeNull()
  })
})

/**
 * Roadmap phase 19 acceptance criterion: "File upload validation
 * rejects disallowed types/oversized files server-side, verified by
 * test — not merely relying on client-side restriction." This is the
 * exact function every upload-recording server action
 * (createDocumentRecord, attachInspectionMedia, attachDamageMedia) now
 * calls before persisting a row — proving it here proves the server-
 * side gate, independent of whatever a client did or didn't check.
 */
describe("validateUploadForCompany — the server-side gate behind every upload-recording action", () => {
  const companyId = "co_1"
  const goodPath = `${companyId}/documents/scan.pdf`

  it("accepts a valid upload for the caller's own company", () => {
    expect(validateUploadForCompany(companyId, goodPath, { type: "application/pdf", size: 1024 }, ACCEPTED_DOCUMENT_MIME_TYPES)).toBeNull()
  })

  it("rejects an oversized file even if a client claims it's fine", () => {
    const result = validateUploadForCompany(
      companyId,
      goodPath,
      { type: "application/pdf", size: MAX_FILE_SIZE_BYTES * 10 },
      ACCEPTED_DOCUMENT_MIME_TYPES
    )
    expect(result).not.toBeNull()
  })

  it("rejects a disallowed mime type even if the client's own <input accept> was bypassed", () => {
    const result = validateUploadForCompany(
      companyId,
      goodPath,
      { type: "application/x-sh", size: 1024 },
      ACCEPTED_DOCUMENT_MIME_TYPES
    )
    expect(result).not.toBeNull()
  })

  it("rejects a storage path claiming another company's folder", () => {
    const result = validateUploadForCompany(
      companyId,
      "some_other_company/documents/scan.pdf",
      { type: "application/pdf", size: 1024 },
      ACCEPTED_DOCUMENT_MIME_TYPES
    )
    expect(result).not.toBeNull()
  })
})
