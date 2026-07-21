import { generateObject } from "ai"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { resolveModel, resolveAvailableProvider } from "@/lib/ai/models"
import { STORAGE_BUCKET } from "@/lib/storage"
import { CATEGORY_OPTIONS } from "@/lib/document-categories"
import type { DocumentCategory } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Structured document extraction (roadmap phase 03 — "Document
 * Intelligence Engine: Ingestion & OCR") and automatic classification
 * (roadmap phase 04 — "Classification, Expiry & Relationships"). Runs a
 * vision-capable model over an already-uploaded document's image, either
 * to guess what kind of document it is (classifyDocument) or to pull
 * structured, per-field values with a confidence score each
 * (extractDocument) — see
 * components/domain/intelligence/document-confidence-row.tsx (phase 02)
 * for the UI half of that contract.
 *
 * Deliberately NOT wired into the existing upload flow in
 * app/(dashboard)/documents/actions.ts — this stays a standalone service,
 * called explicitly. See docs/documents.md for why.
 */

// ---------------------------------------------------------------------
// Schemas — one per supported DocumentCategory. Only four of the nine
// categories on `documents.category` have an extraction schema; the
// rest (rental_contract, proof_of_address, technical_inspection,
// payment_receipt, other) are rejected before ever calling the model —
// see schemaForCategory below. Classification (below the extraction
// schemas) is a separate, lighter call that covers all nine.
// ---------------------------------------------------------------------

export type SupportedDocumentCategory =
  | "identity_document"
  | "driving_licence"
  | "vehicle_registration"
  | "insurance_document"

const SUPPORTED_CATEGORIES: SupportedDocumentCategory[] = [
  "identity_document",
  "driving_licence",
  "vehicle_registration",
  "insurance_document",
]

/** Every extracted field is a value plus the model's own confidence
 * that the value is correct and fully legible — never omitted, even
 * when uncertain, so a schema-validated response always has something
 * for the UI to show and let a human correct (see the prompt below). */
function field<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: z
      .number()
      .min(0)
      .max(100)
      .describe("0-100: how certain you are this value is correct and fully legible"),
  })
}

const isoDate = z.string().describe("ISO 8601 date (YYYY-MM-DD), normalized regardless of how it appears on the document")

const identityDocumentSchema = z.object({
  fullName: field(z.string()),
  idNumber: field(z.string().describe("National ID or passport number")),
  birthDate: field(isoDate),
  expiryDate: field(isoDate),
  nationality: field(z.string()),
})

const drivingLicenceSchema = z.object({
  fullName: field(z.string()),
  licenceNumber: field(z.string()),
  categories: field(z.array(z.string())).describe("Licence categories/classes as printed, e.g. ['B', 'A1']"),
  expiryDate: field(isoDate),
  country: field(z.string()),
})

const vehicleRegistrationSchema = z.object({
  plate: field(z.string()),
  vin: field(z.string()),
  make: field(z.string()),
  model: field(z.string()),
  owner: field(z.string()),
})

const insuranceDocumentSchema = z.object({
  policyNumber: field(z.string()),
  insurer: field(z.string()),
  expiryDate: field(isoDate),
  coverageType: field(z.string()),
})

const SCHEMA_BY_CATEGORY: Record<SupportedDocumentCategory, z.ZodObject> = {
  identity_document: identityDocumentSchema,
  driving_licence: drivingLicenceSchema,
  vehicle_registration: vehicleRegistrationSchema,
  insurance_document: insuranceDocumentSchema,
}

function isSupportedCategory(category: string): category is SupportedDocumentCategory {
  return (SUPPORTED_CATEGORIES as string[]).includes(category)
}

/** Returns null for the five DocumentCategory values with no extraction
 * schema — the fast, free rejection path: never spend a model call on a
 * category that can't be extracted. */
export function schemaForCategory(category: DocumentCategory): z.ZodObject | null {
  return isSupportedCategory(category) ? SCHEMA_BY_CATEGORY[category] : null
}

const CATEGORY_DESCRIPTION: Record<SupportedDocumentCategory, string> = {
  identity_document: "a national ID card or passport",
  driving_licence: "a driving licence",
  vehicle_registration: "a vehicle registration document",
  insurance_document: "an insurance certificate",
}

function buildExtractionPrompt(category: SupportedDocumentCategory): string {
  return [
    `This image shows ${CATEGORY_DESCRIPTION[category]}. Extract every requested field exactly as printed on the document.`,
    "For each field, provide the value and a confidence score from 0 to 100 representing how certain you are the value is correct and fully legible.",
    "Use 95-100 only when the text is completely clear and unambiguous. Use below 70 when the field is blurry, partially obscured, cropped out of frame, or you are guessing.",
    "If a field is genuinely not legible or not present, still provide your best-guess value and set confidence below 40 rather than leaving it out.",
  ].join(" ")
}

// ---------------------------------------------------------------------
// Classification (roadmap phase 04) — a separate, cheaper vision call
// that guesses which of the nine DocumentCategory values an unlabeled
// upload is, so the caller can route it to the right extraction schema
// (or none, for the five categories without one) without asking a human.
// ---------------------------------------------------------------------

const ALL_CATEGORY_VALUES = CATEGORY_OPTIONS.map((o) => o.value) as [DocumentCategory, ...DocumentCategory[]]

const classificationSchema = z.object({
  category: z.enum(ALL_CATEGORY_VALUES),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe("0-100: how certain you are this is the correct category"),
})

function buildClassificationPrompt(): string {
  const options = CATEGORY_OPTIONS.map((o) => `"${o.value}" (${o.label})`).join(", ")
  return [
    "Identify what kind of document this image shows.",
    `Choose exactly one category from this list: ${options}.`,
    "Provide a confidence score from 0 to 100 for how certain you are.",
    'If the document genuinely does not match any specific category, choose "other".',
  ].join(" ")
}

export type ClassificationResult =
  | { ok: true; category: DocumentCategory; confidence: number }
  | { ok: false; error: ExtractionErrorCode; message: string }

// ---------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------

/** Only image formats a vision model call can reliably read today —
 * PDF and HEIC are accepted for upload elsewhere in the app but not
 * supported here yet (see docs/documents.md's known limitations). */
export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

export type ExtractedFields = Record<string, { value: unknown; confidence: number }>

export type ExtractionErrorCode =
  | "not_found"
  | "unsupported_category"
  | "unsupported_file_type"
  | "provider_not_configured"
  | "provider_error"

export type ExtractionResult =
  | { ok: true; extractionId: string; category: SupportedDocumentCategory; fields: ExtractedFields }
  | { ok: false; error: ExtractionErrorCode; message: string }

type DocumentRow = { id: string; category: string; storage_path: string; mime_type: string }

type ResolvedVisionModel =
  | { ok: true; model: Awaited<ReturnType<typeof resolveModel>>; modelId: string }
  | { ok: false; error: ExtractionErrorCode; message: string }

/** The one piece extractDocument/classifyDocument (already-uploaded, by
 * documentId) and extractBytes/classifyBytes (raw bytes, no document row
 * yet — roadmap phase 14's onboarding intake) both need and share no
 * other state for: picking an available provider and resolving its
 * model. Split out so neither path duplicates provider-resolution logic. */
function resolveVisionModel(): ResolvedVisionModel {
  const provider = resolveAvailableProvider()
  if (!provider) {
    return {
      ok: false,
      error: "provider_not_configured",
      message: "No AI provider is configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    }
  }

  const model = resolveModel(provider)
  // LanguageModel is `string | LanguageModelV2` (the AI SDK Gateway
  // allows a bare model-id string) — resolveModel() in this codebase
  // always returns a provider object, never a bare string, but the
  // type itself doesn't guarantee that.
  const modelId = typeof model === "string" ? model : model.modelId
  return { ok: true, model, modelId }
}

type PreparedVisionCall =
  | { ok: true; document: DocumentRow; model: Awaited<ReturnType<typeof resolveModel>>; modelId: string; fileBytes: Buffer }
  | { ok: false; error: ExtractionErrorCode; message: string }

/**
 * Everything extractDocument and classifyDocument both need before they
 * can make a model call: the document row, the file's own bytes, and a
 * resolved model — plus every failure mode they share (not found,
 * unsupported file type, no provider configured, storage read failure).
 * extractDocument re-fetches the row once more itself first, so it can
 * reject an unsupported *category* (cost control) before ever reaching
 * this — the two indexed reads by primary key that results in are not
 * worth the extra complexity of threading an already-fetched row through.
 */
async function prepareVisionCall(
  supabase: SupabaseServerClient,
  companyId: string,
  documentId: string
): Promise<PreparedVisionCall> {
  const { data: document, error: fetchError } = await supabase
    .from("documents")
    .select("id, category, storage_path, mime_type")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (fetchError || !document) {
    return { ok: false, error: "not_found", message: "That document could not be found." }
  }

  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(document.mime_type)) {
    return {
      ok: false,
      error: "unsupported_file_type",
      message: "Only JPEG, PNG, or WEBP images can be read automatically right now — PDF and HEIC aren't supported yet.",
    }
  }

  const resolved = resolveVisionModel()
  if (!resolved.ok) return resolved

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(document.storage_path)

  if (downloadError || !fileBlob) {
    return { ok: false, error: "provider_error", message: "Could not read the uploaded file from storage." }
  }

  const fileBytes = Buffer.from(await fileBlob.arrayBuffer())

  return { ok: true, document, model: resolved.model, modelId: resolved.modelId, fileBytes }
}

/**
 * Runs extraction for one already-uploaded document. Takes an
 * authenticated, RLS-scoped Supabase client as its first argument
 * (matching lib/activity-log.ts#recordEvent's convention, and every
 * other service function in this codebase) rather than a bare file id
 * — this always runs server-side, under the caller's own session.
 *
 * Never throws for expected failure modes (unsupported category/file
 * type, missing document, provider not configured, provider error) —
 * every one of those persists a record (status 'failed' when the
 * provider itself was reached) and returns a typed result instead.
 */
export async function extractDocument(
  supabase: SupabaseServerClient,
  companyId: string,
  documentId: string,
  options: { category?: DocumentCategory } = {}
): Promise<ExtractionResult> {
  const { data: document, error: fetchError } = await supabase
    .from("documents")
    .select("id, category, storage_path, mime_type")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (fetchError || !document) {
    return { ok: false, error: "not_found", message: "That document could not be found." }
  }

  const category = options.category ?? (document.category as DocumentCategory)
  const schema = schemaForCategory(category)
  if (!schema || !isSupportedCategory(category)) {
    return {
      ok: false,
      error: "unsupported_category",
      message: `Automatic extraction isn't available for "${category}" documents yet.`,
    }
  }

  const prepared = await prepareVisionCall(supabase, companyId, documentId)
  if (!prepared.ok) return prepared
  const { model, modelId, fileBytes } = prepared

  try {
    const { object } = await generateObject({
      model,
      schema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractionPrompt(category) },
            { type: "file", data: fileBytes, mediaType: prepared.document.mime_type },
          ],
        },
      ],
    })

    const fields = object as ExtractedFields

    const { data: inserted, error: insertError } = await supabase
      .from("document_extractions")
      .insert({
        company_id: companyId,
        document_id: documentId,
        category,
        status: "completed",
        fields,
        model: modelId,
      })
      .select("id")
      .single()

    if (insertError || !inserted) {
      return { ok: false, error: "provider_error", message: "Extraction succeeded but the result could not be saved." }
    }

    return { ok: true, extractionId: inserted.id as string, category, fields }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error"
    await supabase.from("document_extractions").insert({
      company_id: companyId,
      document_id: documentId,
      category,
      status: "failed",
      error_message: detail,
      model: modelId,
    })
    return {
      ok: false,
      error: "provider_error",
      message: "We couldn't read that document automatically. Try a clearer photo, or enter the details by hand.",
    }
  }
}

/**
 * Guesses which of the nine DocumentCategory values an already-uploaded
 * document is, without assuming the caller (or the row's own stored
 * `category`) already knows. Does not persist anything itself — see
 * classifyAndExtractDocument for the combined "classify, save, then
 * extract" flow that real callers actually want.
 */
export async function classifyDocument(
  supabase: SupabaseServerClient,
  companyId: string,
  documentId: string
): Promise<ClassificationResult> {
  const prepared = await prepareVisionCall(supabase, companyId, documentId)
  if (!prepared.ok) return prepared

  try {
    const { object } = await generateObject({
      model: prepared.model,
      schema: classificationSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildClassificationPrompt() },
            { type: "file", data: prepared.fileBytes, mediaType: prepared.document.mime_type },
          ],
        },
      ],
    })

    return { ok: true, category: object.category, confidence: object.confidence }
  } catch {
    return {
      ok: false,
      error: "provider_error",
      message: "We couldn't classify that document automatically. Try a clearer photo, or choose the category by hand.",
    }
  }
}

export type ClassifyAndExtractResult =
  | { ok: true; category: DocumentCategory; classificationConfidence: number; extraction: ExtractionResult | null }
  | { ok: false; error: ExtractionErrorCode; message: string }

/**
 * The real end-to-end automatic-classification flow (requirement 1 of
 * roadmap phase 04): classify the document, persist the detected
 * category onto the row (so every other reader of `documents.category`
 * sees the correction), then — only for the four categories with an
 * extraction schema — run extraction against that same category.
 * `extraction` is null (not an error) for the five categories phase 03
 * never built a schema for; classification alone still routed the
 * document correctly, which is what requirement 1 actually asks for.
 */
export async function classifyAndExtractDocument(
  supabase: SupabaseServerClient,
  companyId: string,
  documentId: string
): Promise<ClassifyAndExtractResult> {
  const classification = await classifyDocument(supabase, companyId, documentId)
  if (!classification.ok) return classification

  await supabase
    .from("documents")
    .update({ category: classification.category })
    .eq("id", documentId)
    .eq("company_id", companyId)

  const extraction = isSupportedCategory(classification.category)
    ? await extractDocument(supabase, companyId, documentId, { category: classification.category })
    : null

  return {
    ok: true,
    category: classification.category,
    classificationConfidence: classification.confidence,
    extraction,
  }
}

// ---------------------------------------------------------------------
// Bytes-based variants (roadmap phase 14 — "Guided Customer Onboarding:
// Camera-First Document Intake"). A customer doesn't exist yet while an
// employee is scanning their ID/licence, and documents.createDocumentRecord
// requires a reservation/customer/vehicle link — so onboarding can't
// persist a `documents` row (what extractDocument/classifyDocument need)
// until the customer record itself has been created. These three
// functions run the exact same vision calls directly against
// in-memory file bytes instead, with no Supabase dependency and nothing
// persisted — the caller (an onboarding wizard) holds the result in
// React state and, once the customer is actually created, uploads the
// same File to Storage and calls createDocumentRecord itself, exactly
// like any other document upload elsewhere in the app.
// ---------------------------------------------------------------------

export type BytesExtractionResult =
  | { ok: true; category: SupportedDocumentCategory; fields: ExtractedFields }
  | { ok: false; error: ExtractionErrorCode; message: string }

export type BytesClassifyAndExtractResult =
  | { ok: true; category: DocumentCategory; classificationConfidence: number; extraction: BytesExtractionResult | null }
  | { ok: false; error: ExtractionErrorCode; message: string }

/** Same guess-the-category call as classifyDocument, against raw bytes
 * instead of an already-uploaded document row. */
export async function classifyBytes(fileBytes: Buffer, mimeType: string): Promise<ClassificationResult> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType)) {
    return {
      ok: false,
      error: "unsupported_file_type",
      message: "Only JPEG, PNG, or WEBP images can be read automatically right now — PDF and HEIC aren't supported yet.",
    }
  }

  const resolved = resolveVisionModel()
  if (!resolved.ok) return resolved

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: classificationSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildClassificationPrompt() },
            { type: "file", data: fileBytes, mediaType: mimeType },
          ],
        },
      ],
    })

    return { ok: true, category: object.category, confidence: object.confidence }
  } catch {
    return {
      ok: false,
      error: "provider_error",
      message: "We couldn't classify that document automatically. Try a clearer photo, or choose the category by hand.",
    }
  }
}

/** Same structured-field extraction as extractDocument, against raw
 * bytes instead of an already-uploaded document row — nothing is
 * persisted (no document_extractions row, since there is no document_id
 * yet), the caller keeps the result in memory. */
export async function extractBytes(
  fileBytes: Buffer,
  mimeType: string,
  category: DocumentCategory
): Promise<BytesExtractionResult> {
  const schema = schemaForCategory(category)
  if (!schema || !isSupportedCategory(category)) {
    return {
      ok: false,
      error: "unsupported_category",
      message: `Automatic extraction isn't available for "${category}" documents yet.`,
    }
  }

  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType)) {
    return {
      ok: false,
      error: "unsupported_file_type",
      message: "Only JPEG, PNG, or WEBP images can be read automatically right now — PDF and HEIC aren't supported yet.",
    }
  }

  const resolved = resolveVisionModel()
  if (!resolved.ok) return resolved

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractionPrompt(category) },
            { type: "file", data: fileBytes, mediaType: mimeType },
          ],
        },
      ],
    })

    return { ok: true, category, fields: object as ExtractedFields }
  } catch {
    return {
      ok: false,
      error: "provider_error",
      message: "We couldn't read that document automatically. Try a clearer photo, or enter the details by hand.",
    }
  }
}

/** The bytes-based end-to-end flow onboarding actually calls: classify
 * first (the employee doesn't pick a category up front — they just
 * point the camera at whatever document they're holding), then extract
 * only when the guessed category has a schema. Mirrors
 * classifyAndExtractDocument's shape exactly, minus persistence. */
export async function classifyAndExtractBytes(fileBytes: Buffer, mimeType: string): Promise<BytesClassifyAndExtractResult> {
  const classification = await classifyBytes(fileBytes, mimeType)
  if (!classification.ok) return classification

  const extraction = isSupportedCategory(classification.category)
    ? await extractBytes(fileBytes, mimeType, classification.category)
    : null

  return {
    ok: true,
    category: classification.category,
    classificationConfidence: classification.confidence,
    extraction,
  }
}

/** True when any extracted field's value contains `query` (case-
 * insensitive substring) — the matching primitive behind document
 * search-by-extracted-field (roadmap phase 04 requirement 7, see
 * lib/documents.ts#searchDocumentIdsByExtractedFields). Pure and cheap
 * enough to run in JS over an already-fetched batch of extractions
 * rather than needing a database-side JSONB text search. */
export function fieldsContainText(fields: ExtractedFields, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return Object.values(fields).some(({ value }) => {
    if (value == null) return false
    if (Array.isArray(value)) return value.some((item) => String(item).toLowerCase().includes(q))
    return String(value).toLowerCase().includes(q)
  })
}
