/**
 * Shared, environment-agnostic storage helpers — path construction,
 * filename sanitization, and upload validation. No Supabase client here on
 * purpose, so this file can be imported from both client and server code
 * without pulling in `next/headers` or a browser-only API.
 *
 * Storage path convention (also documented in the bucket-policy migration,
 * supabase/migrations/20260719090700_storage.sql): the FIRST path segment
 * is always the company id, because the RLS policies on `storage.objects`
 * extract it with `storage.foldername(name)` and check it against real
 * membership rows. Never build a path any other way.
 */

export const STORAGE_BUCKET = "company-files"

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15MB — generous for a phone photo or a scanned PDF

export const ACCEPTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"]
export const ACCEPTED_DOCUMENT_MIME_TYPES = [...ACCEPTED_IMAGE_MIME_TYPES, "application/pdf"]

/** The subset of ACCEPTED_IMAGE_MIME_TYPES a vision model call can
 * actually read (lib/document-extraction.ts's SUPPORTED_IMAGE_MIME_TYPES,
 * duplicated here rather than imported so client components can validate
 * a camera capture without pulling in a server-only module — no HEIC,
 * since most phone cameras that produce it don't when `capture` is set). */
export const ACCEPTED_SCAN_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

/** Strips anything that isn't a safe filename character and caps length —
 * the original name is kept for display (`original_filename` in the DB),
 * this is only used to build the storage path itself. */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(-120)
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_") || "file"
}

/**
 * Builds a collision-proof, company-prefixed storage path:
 *   {companyId}/{...segments}/{random}-{sanitized filename}
 */
export function buildStoragePath(companyId: string, segments: string[], filename: string): string {
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  const safeName = `${unique}-${sanitizeFilename(filename)}`
  return [companyId, ...segments, safeName].join("/")
}

export interface FileLike {
  type: string
  size: number
}

/** Returns a user-facing error string, or null if the file is acceptable. */
export function validateFile(file: FileLike, acceptedMimeTypes: string[]): string | null {
  if (file.size <= 0) return "That file appears to be empty."
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `That file is too large — the limit is ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`
  }
  if (!acceptedMimeTypes.includes(file.type)) {
    return "That file type isn't supported here."
  }
  return null
}

/**
 * Roadmap phase 19 — every upload-recording server action
 * (createDocumentRecord, attachInspectionMedia, attachDamageMedia) called
 * `validateFile()` and re-checked the storage path's company prefix
 * inline, identically, three times. `validateFile()` alone was never
 * enough on its own: before this phase, ONLY client components ever
 * called it — the server actions that persist the resulting DB row
 * trusted `mimeType`/`fileSizeBytes` as plain client-supplied strings.
 * This is the one place both checks live now, so all three server
 * actions run the identical gate and it's unit-testable without mocking
 * a server action's auth/DB dependencies.
 *
 * Doesn't (can't) verify the actual uploaded bytes — uploads go
 * directly browser -> Supabase Storage, so a server action never sees
 * them, only the metadata the client reports about them. Real content
 * verification would mean routing uploads through a server-side proxy
 * or a Storage webhook — a materially larger architecture change than
 * this hardening pass's scope (see docs/security.md's "Document
 * security" section).
 */
export function validateUploadForCompany(
  companyId: string,
  storagePath: string,
  file: FileLike,
  acceptedMimeTypes: string[]
): string | null {
  const fileError = validateFile(file, acceptedMimeTypes)
  if (fileError) return fileError
  if (!storagePath.startsWith(`${companyId}/`)) {
    return "That file path doesn't belong to your company."
  }
  return null
}
