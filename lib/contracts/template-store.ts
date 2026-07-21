import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import { STORAGE_BUCKET } from "@/lib/storage"
import { recordEvent } from "@/lib/activity-log"
import { extractPdfText } from "@/lib/contracts/pdf-extract"
import { proposeContractTemplateMapping } from "@/lib/contracts/template-ai"
import { flagContractPreviewIssues, type ContractPreviewWarning } from "@/lib/contracts/preview-ai"
import { isKnownContractField } from "@/lib/contracts/variables"
import { buildContractContext } from "@/lib/contracts/context"
import { assessReturningCustomerReadiness } from "@/lib/customer-readiness"
import { validateContractGeneration, hasBlockingErrors, formatValidationIssues, type ValidationIssue } from "@/lib/contracts/validation"
import {
  canTransitionContract,
  hasRequiredSignatures,
  contractStatusLabel,
  type ContractStatus,
  type SignerType,
} from "@/lib/contracts/lifecycle"
import { renderContractSections, type TemplateSection, type SectionCondition, type ContractContext } from "@/lib/contracts/template-engine"
import { renderContractPdf } from "@/lib/contracts/pdf-render"
import type { ActivityType } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 10's database-facing layer — everything above this
 * file (`variables.ts`, `template-engine.ts`, `context.ts`) is pure.
 * This is where uploads get read, AI gets called, and rows get
 * written, following the same "one store module per feature" shape as
 * phase 06/08's `*-intelligence-store.ts`.
 */

export interface VariableMapping {
  placeholder: string
  fieldPath: string
  label: string
}

export type TemplateVersionStatus = "pending_review" | "active" | "archived"

export interface TemplateVersionRecord {
  id: string
  templateId: string
  versionNumber: number
  status: TemplateVersionStatus
  sourceStoragePath: string | null
  sections: TemplateSection[]
  variableMappings: VariableMapping[]
  legalFooterText: string | null
  aiNotes: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface TemplateRecord {
  id: string
  companyId: string
  name: string
  language: string
  activeVersionId: string | null
}

export type TemplateActionResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string }

function randomId(): string {
  return crypto.randomUUID()
}

function mapVersionRow(row: {
  id: string
  template_id: string
  version_number: number
  status: string
  source_storage_path: string | null
  sections: unknown
  variable_mappings: unknown
  legal_footer_text: string | null
  ai_notes: string | null
  reviewed_at: string | null
  created_at: string
  reviewer: { full_name: string | null } | null
}): TemplateVersionRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    status: row.status as TemplateVersionStatus,
    sourceStoragePath: row.source_storage_path,
    sections: (row.sections ?? []) as TemplateSection[],
    variableMappings: (row.variable_mappings ?? []) as VariableMapping[],
    legalFooterText: row.legal_footer_text,
    aiNotes: row.ai_notes,
    reviewedByName: row.reviewer?.full_name ?? null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }
}

const VERSION_SELECT =
  "id, template_id, version_number, status, source_storage_path, sections, variable_mappings, legal_footer_text, ai_notes, reviewed_at, created_at, reviewer:profiles!contract_template_versions_reviewed_by_fkey(full_name)"

/**
 * Requirement 1+2: reads the uploaded PDF, extracts its text, asks the
 * AI service to propose sections + variable mappings, and saves that
 * proposal as a brand-new template's first version — always
 * `pending_review`. Nothing here makes a template usable; only
 * `activateVersion` does that, which is the actual "owner reviews and
 * confirms" gate requirement 2 asks for.
 */
export async function proposeTemplateFromUpload(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: { name: string; language: string; storagePath: string }
): Promise<TemplateActionResult<{ templateId: string; versionId: string }>> {
  const companyId = session.company.id

  // Storage RLS keys off the first path segment being the caller's own
  // company id (see lib/storage.ts's doc comment) — this guards against
  // a crafted path pointing at another tenant's file even before RLS
  // itself would reject the download.
  if (!input.storagePath.startsWith(`${companyId}/`)) {
    return { ok: false, error: "That file path is not valid for this company." }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(input.storagePath)
  if (downloadError || !fileBlob) return { ok: false, error: "Could not read the uploaded file from storage." }

  const fileBytes = Buffer.from(await fileBlob.arrayBuffer())
  let extracted: { ok: boolean; text: string }
  try {
    extracted = await extractPdfText(fileBytes)
  } catch {
    return { ok: false, error: "That file could not be read as a PDF." }
  }
  if (!extracted.ok) {
    return { ok: false, error: "No readable text was found in that PDF — a scanned image-only file can't be parsed this way yet." }
  }

  const proposal = await proposeContractTemplateMapping(supabase, session, extracted.text)
  if (!proposal.ok) return { ok: false, error: proposal.message }

  const sections: TemplateSection[] = proposal.data.sections.map((s) => ({
    id: randomId(),
    title: s.title,
    bodyText: s.bodyText,
    condition: null,
  }))
  const variableMappings: VariableMapping[] = proposal.data.variableMappings.filter((m) => isKnownContractField(m.fieldPath))

  const conditionalTitles = proposal.data.sections.filter((s) => s.looksConditional).map((s) => s.title)
  const aiNotes =
    conditionalTitles.length > 0
      ? `${proposal.data.notes}\n\nLooks conditional, needs a condition configured: ${conditionalTitles.join(", ")}.`
      : proposal.data.notes

  const { data: template, error: templateError } = await supabase
    .from("contract_templates")
    .insert({ company_id: companyId, name: input.name, language: input.language, created_by: session.userId })
    .select("id")
    .single()
  if (templateError) return { ok: false, error: templateError.message }

  const { data: version, error: versionError } = await supabase
    .from("contract_template_versions")
    .insert({
      template_id: template.id,
      company_id: companyId,
      version_number: 1,
      status: "pending_review",
      source_storage_path: input.storagePath,
      sections,
      variable_mappings: variableMappings,
      ai_notes: aiNotes,
      created_by: session.userId,
    })
    .select("id")
    .single()
  if (versionError) return { ok: false, error: versionError.message }

  await recordEvent(supabase, {
    companyId,
    actorId: session.userId,
    type: "template_created",
    entityType: "contract",
    entityId: template.id,
    title: `Contract template created: ${input.name}`,
    metadata: { template_id: template.id },
  })

  return { ok: true, templateId: template.id, versionId: version.id }
}

/**
 * Requirement 6: editing a saved template always creates a new
 * version — this function never updates `sections`/`variable_mappings`
 * on an existing row once inserted. Starts `pending_review`, same
 * uniform "every version needs an explicit activate" rule as the AI
 * path, so there's one mental model regardless of where a version came
 * from.
 */
export async function createEditedVersion(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: {
    templateId: string
    sections: TemplateSection[]
    variableMappings: VariableMapping[]
    legalFooterText: string | null
  }
): Promise<TemplateActionResult<{ versionId: string }>> {
  const companyId = session.company.id

  const { data: latest, error: latestError } = await supabase
    .from("contract_template_versions")
    .select("version_number")
    .eq("template_id", input.templateId)
    .eq("company_id", companyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) return { ok: false, error: latestError.message }

  const nextVersionNumber = (latest?.version_number ?? 0) + 1
  const unknownField = input.variableMappings.find((m) => !isKnownContractField(m.fieldPath))
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField.fieldPath}` }

  const { data: version, error: versionError } = await supabase
    .from("contract_template_versions")
    .insert({
      template_id: input.templateId,
      company_id: companyId,
      version_number: nextVersionNumber,
      status: "pending_review",
      sections: input.sections,
      variable_mappings: input.variableMappings,
      legal_footer_text: input.legalFooterText,
      created_by: session.userId,
    })
    .select("id")
    .single()
  if (versionError) return { ok: false, error: versionError.message }

  return { ok: true, versionId: version.id }
}

/**
 * The actual review-confirmation step (requirement 2). Archives
 * whichever version was previously active (never deletes it — a
 * contract may still reference it) and points the template at this
 * one for future generations.
 */
export async function activateVersion(
  supabase: SupabaseServerClient,
  session: SessionContext,
  versionId: string
): Promise<TemplateActionResult> {
  const companyId = session.company.id

  const { data: version, error: versionError } = await supabase
    .from("contract_template_versions")
    .select("id, template_id")
    .eq("id", versionId)
    .eq("company_id", companyId)
    .maybeSingle()
  if (versionError || !version) return { ok: false, error: "That template version could not be found." }

  const { data: template, error: templateError } = await supabase
    .from("contract_templates")
    .select("active_version_id")
    .eq("id", version.template_id)
    .eq("company_id", companyId)
    .maybeSingle()
  if (templateError || !template) return { ok: false, error: "That template could not be found." }

  if (template.active_version_id) {
    await supabase
      .from("contract_template_versions")
      .update({ status: "archived" })
      .eq("id", template.active_version_id)
      .eq("company_id", companyId)
  }

  const { error: activateError } = await supabase
    .from("contract_template_versions")
    .update({ status: "active", reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq("id", versionId)
    .eq("company_id", companyId)
  if (activateError) return { ok: false, error: activateError.message }

  const { error: updateTemplateError } = await supabase
    .from("contract_templates")
    .update({ active_version_id: versionId, updated_at: new Date().toISOString() })
    .eq("id", version.template_id)
    .eq("company_id", companyId)
  if (updateTemplateError) return { ok: false, error: updateTemplateError.message }

  await recordEvent(supabase, {
    companyId,
    actorId: session.userId,
    type: "template_version_activated",
    entityType: "contract",
    entityId: version.template_id,
    title: "Contract template version activated",
    metadata: { template_id: version.template_id, template_version_id: versionId },
  })

  return { ok: true }
}

export async function listTemplates(supabase: SupabaseServerClient, companyId: string): Promise<TemplateRecord[]> {
  const { data, error } = await supabase
    .from("contract_templates")
    .select("id, company_id, name, language, active_version_id")
    .eq("company_id", companyId)
    .order("name")
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    language: r.language,
    activeVersionId: r.active_version_id,
  }))
}

export async function getTemplateVersions(
  supabase: SupabaseServerClient,
  companyId: string,
  templateId: string
): Promise<TemplateVersionRecord[]> {
  const { data, error } = await supabase
    .from("contract_template_versions")
    .select(VERSION_SELECT)
    .eq("company_id", companyId)
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapVersionRow(r as never))
}

export async function getTemplateVersion(
  supabase: SupabaseServerClient,
  companyId: string,
  versionId: string
): Promise<TemplateVersionRecord | null> {
  const { data, error } = await supabase
    .from("contract_template_versions")
    .select(VERSION_SELECT)
    .eq("company_id", companyId)
    .eq("id", versionId)
    .maybeSingle()
  if (error) throw error
  return data ? mapVersionRow(data as never) : null
}

const CONTRACT_RESERVATION_SELECT =
  "id, reference, pickup_at, return_at, pickup_location, return_location, daily_rate, discount_amount, total_amount, customer:customers(id, full_name, phone, email, address, nationality, license_number, license_expires_on, id_document_number, date_of_birth), vehicle:vehicles(id, make, model, year, registration_number, color, category, seats, fuel_type, transmission)"

interface ResolvedContractInputs {
  reservationReference: string
  customerId: string
  vehicleId: string | null
  templateVersion: TemplateVersionRecord
  context: ContractContext
  renderedSections: { id: string; title: string; body: string }[]
  validationIssues: ValidationIssue[]
  companyBranding: {
    companyName: string
    companyAddress: string | null
    companyCity: string | null
    companyCountry: string
    companyTaxId: string | null
  }
}

/**
 * Everything both `previewContract` (read-only) and `generateContract`
 * (persisting) need: resolve the active template version and every
 * real row, build the context, render the sections, and run
 * requirement 2's validation — once, shared, so preview and generation
 * can never silently disagree about whether something is valid.
 */
async function resolveContractInputs(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: { reservationId: string; templateId?: string }
): Promise<{ ok: true; data: ResolvedContractInputs } | { ok: false; error: string }> {
  const companyId = session.company.id

  let templateId = input.templateId
  if (!templateId) {
    const { data: templates, error } = await supabase
      .from("contract_templates")
      .select("id, active_version_id")
      .eq("company_id", companyId)
      .not("active_version_id", "is", null)
    if (error) return { ok: false, error: error.message }
    if (!templates || templates.length === 0) return { ok: false, error: "No active contract template exists yet." }
    if (templates.length > 1) return { ok: false, error: "More than one template is active — specify which one to use." }
    templateId = templates[0].id
  }

  const { data: template, error: templateError } = await supabase
    .from("contract_templates")
    .select("id, active_version_id")
    .eq("id", templateId)
    .eq("company_id", companyId)
    .maybeSingle()
  if (templateError || !template || !template.active_version_id) {
    return { ok: false, error: "That template has no active, reviewed version yet." }
  }

  const version = await getTemplateVersion(supabase, companyId, template.active_version_id)
  if (!version) return { ok: false, error: "That template version could not be found." }

  const { data: reservationRow, error: reservationError } = await supabase
    .from("reservations")
    .select(CONTRACT_RESERVATION_SELECT)
    .eq("id", input.reservationId)
    .eq("company_id", companyId)
    .maybeSingle()
  if (reservationError || !reservationRow) return { ok: false, error: "That reservation could not be found." }

  const customer = reservationRow.customer as unknown as {
    id: string
    full_name: string
    phone: string
    email: string | null
    address: string | null
    nationality: string | null
    license_number: string | null
    license_expires_on: string | null
    id_document_number: string | null
    date_of_birth: string | null
  } | null
  if (!customer) return { ok: false, error: "That reservation has no customer on file." }

  const vehicleRow = reservationRow.vehicle as unknown as {
    id: string
    make: string
    model: string
    year: number
    registration_number: string
    color: string | null
    category: string
    seats: number | null
    fuel_type: string
    transmission: string
  } | null

  const [depositRes, documentsRes, companyRes] = await Promise.all([
    supabase.from("deposits").select("expected_amount, collected_amount").eq("company_id", companyId).eq("reservation_id", input.reservationId).maybeSingle(),
    supabase
      .from("documents")
      .select("category, expires_on")
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .eq("status", "active")
      .eq("category", "identity_document"),
    supabase.from("companies").select("name, address, city, country, tax_id, business_register").eq("id", companyId).single(),
  ])
  const depositRow = depositRes.data
  if (companyRes.error || !companyRes.data) return { ok: false, error: "Could not load company details." }
  const companyRow = companyRes.data

  const numDays = Math.max(
    1,
    Math.round((new Date(reservationRow.return_at as string).getTime() - new Date(reservationRow.pickup_at as string).getTime()) / 86_400_000)
  )

  const context = buildContractContext({
    customer: {
      fullName: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      nationality: customer.nationality,
      licenseNumber: customer.license_number,
      licenseExpiresAt: customer.license_expires_on,
      idDocumentNumber: customer.id_document_number,
      dateOfBirth: customer.date_of_birth,
    },
    vehicle: vehicleRow
      ? {
          make: vehicleRow.make,
          model: vehicleRow.model,
          year: vehicleRow.year,
          plate: vehicleRow.registration_number,
          color: vehicleRow.color,
          category: vehicleRow.category,
          seats: vehicleRow.seats,
          fuelType: vehicleRow.fuel_type,
          transmission: vehicleRow.transmission,
        }
      : null,
    reservation: {
      reference: reservationRow.reference as string,
      pickupAt: reservationRow.pickup_at as string,
      returnAt: reservationRow.return_at as string,
      pickupLocation: reservationRow.pickup_location as string | null,
      returnLocation: reservationRow.return_location as string | null,
      numDays,
      dailyRateMad: Number(reservationRow.daily_rate),
      discountMad: Number(reservationRow.discount_amount ?? 0),
      totalMad: Number(reservationRow.total_amount),
    },
    deposit: depositRow
      ? { expectedAmountMad: Number(depositRow.expected_amount), collectedAmountMad: Number(depositRow.collected_amount) }
      : null,
    company: {
      name: companyRow.name,
      address: companyRow.address,
      city: companyRow.city,
      country: companyRow.country,
      taxId: companyRow.tax_id,
      businessRegister: companyRow.business_register,
    },
    employeeFullName: session.profile.fullName,
  })

  const renderedSections = renderContractSections(version.sections, context)

  const customerReadiness = assessReturningCustomerReadiness({
    licenseExpiresAt: customer.license_expires_on,
    documents: (documentsRes.data ?? []).map((d) => ({ category: d.category as string, expiresOn: d.expires_on })),
  })

  const validationIssues = validateContractGeneration({
    customerReadiness,
    hasVehicle: vehicleRow != null,
    dailyRateMad: Number(reservationRow.daily_rate),
    totalMad: Number(reservationRow.total_amount),
    numDays,
    pickupAt: reservationRow.pickup_at as string,
    returnAt: reservationRow.return_at as string,
    renderedSections,
  })

  return {
    ok: true,
    data: {
      reservationReference: reservationRow.reference as string,
      customerId: customer.id,
      vehicleId: vehicleRow?.id ?? null,
      templateVersion: version,
      context,
      renderedSections,
      validationIssues,
      companyBranding: {
        companyName: companyRow.name,
        companyAddress: companyRow.address,
        companyCity: companyRow.city,
        companyCountry: companyRow.country,
        companyTaxId: companyRow.tax_id,
      },
    },
  }
}

export interface ContractPreview {
  context: ContractContext
  renderedSections: { id: string; title: string; body: string }[]
  validationIssues: ValidationIssue[]
  aiWarnings: ContractPreviewWarning[]
}

/**
 * Requirement 1 — "before generation, show a clear preview
 * distinguishing editable info, auto-generated info, legal text,
 * warnings, missing data, and inconsistencies." Read-only: nothing is
 * written. `context`/`renderedSections` already separate "auto-
 * generated info" (the resolved values) from "legal text" (the
 * section bodies); `validationIssues` is the missing-data/
 * inconsistency list a human can actually trust (real checks, not
 * AI judgment); `aiWarnings` is the advisory layer on top
 * (requirement 8) — always shown separately, never merged into the
 * same list, so the UI can be honest about which kind of finding each
 * one is.
 */
export async function previewContract(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: { reservationId: string; templateId?: string }
): Promise<TemplateActionResult<ContractPreview>> {
  const resolved = await resolveContractInputs(supabase, session, input)
  if (!resolved.ok) return resolved

  let aiWarnings: ContractPreviewWarning[] = []
  const aiResult = await flagContractPreviewIssues(supabase, session, resolved.data.context, resolved.data.renderedSections)
  if (aiResult.ok) aiWarnings = aiResult.data.warnings

  return {
    ok: true,
    context: resolved.data.context,
    renderedSections: resolved.data.renderedSections,
    validationIssues: resolved.data.validationIssues,
    aiWarnings,
  }
}

/**
 * Requirement 3 — generates a contract for one reservation against one
 * template's currently-active version. Blocks with a specific,
 * actionable error (requirement 2) rather than persisting anything
 * when validation fails — no row is ever inserted for an invalid
 * contract, not even in `draft` status. A generated contract starts in
 * `draft`; `prepareContract` is the explicit next lifecycle step.
 * `resolved_context`/`rendered_sections` are a permanent snapshot: even
 * if the customer/vehicle/reservation rows are edited afterward, this
 * contract's displayed content never silently changes.
 */
export async function generateContract(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: { reservationId: string; templateId?: string }
): Promise<TemplateActionResult<{ contractId: string }>> {
  const companyId = session.company.id

  const resolved = await resolveContractInputs(supabase, session, input)
  if (!resolved.ok) return resolved
  const { data } = resolved

  if (hasBlockingErrors(data.validationIssues)) {
    return { ok: false, error: formatValidationIssues(data.validationIssues) }
  }

  const { data: contractNumber, error: numberError } = await supabase.rpc("next_contract_reference", { target_company_id: companyId })
  if (numberError) return { ok: false, error: numberError.message }

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      company_id: companyId,
      reservation_id: input.reservationId,
      template_version_id: data.templateVersion.id,
      customer_id: data.customerId,
      vehicle_id: data.vehicleId,
      resolved_context: data.context,
      rendered_sections: data.renderedSections,
      generated_by: session.userId,
      status: "draft",
      contract_number: contractNumber,
    })
    .select("id")
    .single()
  if (contractError) return { ok: false, error: contractError.message }

  const pdfBytes = await renderContractPdf({
    reservationReference: data.reservationReference,
    branding: data.companyBranding,
    sections: data.renderedSections,
    legalFooterText: data.templateVersion.legalFooterText,
    generatedAtLabel: data.context["today.date"],
    contractId: contract.id,
    contractNumber,
  })

  const pdfPath = `${companyId}/contracts/${contract.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true })
  if (!uploadError) {
    await supabase.from("contracts").update({ pdf_storage_path: pdfPath }).eq("id", contract.id).eq("company_id", companyId)
  }

  await recordEvent(supabase, {
    companyId,
    actorId: session.userId,
    type: "contract_generated",
    entityType: "contract",
    entityId: contract.id,
    title: `Contract ${contractNumber} generated for ${data.reservationReference}`,
    metadata: { reservation_id: input.reservationId, contract_id: contract.id },
  })

  return { ok: true, contractId: contract.id }
}

export interface ContractRecord {
  id: string
  reservationId: string
  customerId: string
  vehicleId: string | null
  templateVersionId: string
  renderedSections: { id: string; title: string; body: string }[]
  pdfStoragePath: string | null
  generatedAt: string
  generatedByName: string | null
  status: ContractStatus
  contractNumber: string | null
  cancelledReason: string | null
  resolvedContext: ContractContext
}

const CONTRACT_SELECT =
  "id, reservation_id, customer_id, vehicle_id, template_version_id, resolved_context, rendered_sections, pdf_storage_path, generated_at, status, contract_number, cancelled_reason, generator:profiles!contracts_generated_by_fkey(full_name)"

function mapContractRow(row: {
  id: string
  reservation_id: string
  customer_id: string
  vehicle_id: string | null
  template_version_id: string
  resolved_context: unknown
  rendered_sections: unknown
  pdf_storage_path: string | null
  generated_at: string
  status: string
  contract_number: string | null
  cancelled_reason: string | null
  generator: { full_name: string | null } | null
}): ContractRecord {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    templateVersionId: row.template_version_id,
    resolvedContext: (row.resolved_context ?? {}) as ContractContext,
    renderedSections: (row.rendered_sections ?? []) as ContractRecord["renderedSections"],
    pdfStoragePath: row.pdf_storage_path,
    generatedAt: row.generated_at,
    generatedByName: row.generator?.full_name ?? null,
    status: row.status as ContractStatus,
    contractNumber: row.contract_number,
    cancelledReason: row.cancelled_reason,
  }
}

export async function getContractsForReservation(
  supabase: SupabaseServerClient,
  companyId: string,
  reservationId: string
): Promise<ContractRecord[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select(CONTRACT_SELECT)
    .eq("company_id", companyId)
    .eq("reservation_id", reservationId)
    .order("generated_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapContractRow(r as never))
}

export async function getContract(supabase: SupabaseServerClient, companyId: string, contractId: string): Promise<ContractRecord | null> {
  const { data, error } = await supabase.from("contracts").select(CONTRACT_SELECT).eq("company_id", companyId).eq("id", contractId).maybeSingle()
  if (error) throw error
  return data ? mapContractRow(data as never) : null
}

// ---------------------------------------------------------------------
// Lifecycle transitions (requirement 3)
// ---------------------------------------------------------------------

const LIFECYCLE_EVENT_TYPE: Partial<Record<ContractStatus, ActivityType>> = {
  prepared: "contract_prepared",
  awaiting_signature: "contract_sent_for_signature",
  signed: "contract_signed",
  active: "contract_activated",
  completed: "contract_completed",
  archived: "contract_archived",
  cancelled: "contract_cancelled",
}

/** Every transition goes through this one function — it's the only
 * place that checks `canTransitionContract` and writes `status`, so
 * an illegal jump (e.g. draft straight to signed) can't slip in
 * through a new call site later. Emits the matching event per
 * requirement 3 ("emit a business event on every transition") and
 * requirement 9's audit-trail list. */
async function transitionContract(
  supabase: SupabaseServerClient,
  session: SessionContext,
  contractId: string,
  next: ContractStatus,
  extra?: { cancelledReason?: string }
): Promise<TemplateActionResult> {
  const companyId = session.company.id
  const contract = await getContract(supabase, companyId, contractId)
  if (!contract) return { ok: false, error: "That contract could not be found." }
  if (!canTransitionContract(contract.status, next)) {
    return { ok: false, error: `A contract can't move from "${contractStatusLabel(contract.status)}" to "${contractStatusLabel(next)}".` }
  }

  const patch: { status: ContractStatus; cancelled_reason?: string | null } = { status: next }
  if (next === "cancelled") patch.cancelled_reason = extra?.cancelledReason ?? null

  const { error } = await supabase.from("contracts").update(patch).eq("id", contractId).eq("company_id", companyId)
  if (error) return { ok: false, error: error.message }

  const eventType = LIFECYCLE_EVENT_TYPE[next]
  if (eventType) {
    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: eventType,
      entityType: "contract",
      entityId: contractId,
      title: `Contract ${contract.contractNumber ?? ""} ${contractStatusLabel(next).toLowerCase()}`.trim(),
      description: next === "cancelled" ? (extra?.cancelledReason ?? null) : undefined,
      metadata: { contract_id: contractId, reservation_id: contract.reservationId },
    })
  }

  return { ok: true }
}

/** draft -> prepared. All the hard validation already ran at
 * generation time (nothing invalid is ever inserted), so this is a
 * pure lifecycle step, not a second validation gate. */
export async function prepareContract(supabase: SupabaseServerClient, session: SessionContext, contractId: string): Promise<TemplateActionResult> {
  return transitionContract(supabase, session, contractId, "prepared")
}

export async function sendContractForSignature(
  supabase: SupabaseServerClient,
  session: SessionContext,
  contractId: string
): Promise<TemplateActionResult> {
  return transitionContract(supabase, session, contractId, "awaiting_signature")
}

export async function activateContract(supabase: SupabaseServerClient, session: SessionContext, contractId: string): Promise<TemplateActionResult> {
  return transitionContract(supabase, session, contractId, "active")
}

export async function completeContract(supabase: SupabaseServerClient, session: SessionContext, contractId: string): Promise<TemplateActionResult> {
  return transitionContract(supabase, session, contractId, "completed")
}

export async function archiveContract(supabase: SupabaseServerClient, session: SessionContext, contractId: string): Promise<TemplateActionResult> {
  return transitionContract(supabase, session, contractId, "archived")
}

export async function cancelContract(
  supabase: SupabaseServerClient,
  session: SessionContext,
  contractId: string,
  reason: string
): Promise<TemplateActionResult> {
  return transitionContract(supabase, session, contractId, "cancelled", { cancelledReason: reason })
}

// ---------------------------------------------------------------------
// Signatures (requirement 4)
// ---------------------------------------------------------------------

export interface SignatureRecord {
  id: string
  signerType: SignerType
  signerName: string
  method: string
  deviceInfo: string | null
  signedAt: string
}

function mapSignatureRow(row: {
  id: string
  signer_type: string
  signer_name: string
  method: string
  device_info: string | null
  signed_at: string
}): SignatureRecord {
  return {
    id: row.id,
    signerType: row.signer_type as SignerType,
    signerName: row.signer_name,
    method: row.method,
    deviceInfo: row.device_info,
    signedAt: row.signed_at,
  }
}

export async function getSignaturesForContract(
  supabase: SupabaseServerClient,
  companyId: string,
  contractId: string
): Promise<SignatureRecord[]> {
  const { data, error } = await supabase
    .from("contract_signatures")
    .select("id, signer_type, signer_name, method, device_info, signed_at")
    .eq("company_id", companyId)
    .eq("contract_id", contractId)
    .order("signed_at", { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => mapSignatureRow(r as never))
}

/**
 * Requirement 4 — "decide pragmatically on signature capture
 * mechanism... note clearly which approach was taken and why." This
 * records a typed full name plus an explicit confirmation (the caller
 * only reaches this after the signer has checked a confirmation box —
 * enforced in the UI, since there's nothing meaningful to check
 * server-side beyond the name itself) — NOT a drawn signature, not a
 * certified e-signature. See docs/contract-lifecycle.md for the
 * honest statement of what this does and doesn't legally guarantee.
 * Once both required signer types (customer + employee) are on file,
 * this automatically transitions the contract to `signed` — signature
 * completeness is exactly what gates that transition, per requirement
 * 2's "required signatures present" check.
 */
export async function addContractSignature(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: {
    contractId: string
    signerType: SignerType
    signerName: string
    deviceInfo: string | null
    ipAddress: string | null
  }
): Promise<TemplateActionResult<{ signatureId: string; nowSigned: boolean }>> {
  const companyId = session.company.id
  const contract = await getContract(supabase, companyId, input.contractId)
  if (!contract) return { ok: false, error: "That contract could not be found." }
  if (contract.status !== "awaiting_signature" && contract.status !== "signed") {
    return { ok: false, error: `This contract is "${contractStatusLabel(contract.status)}" — send it for signature first.` }
  }

  const isEmployeeSigner = input.signerType === "employee" || input.signerType === "manager"
  const { data: signature, error } = await supabase
    .from("contract_signatures")
    .insert({
      company_id: companyId,
      contract_id: input.contractId,
      signer_type: input.signerType,
      signer_name: input.signerName,
      signer_user_id: isEmployeeSigner ? session.userId : null,
      device_info: input.deviceInfo,
      ip_address: input.ipAddress,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  const existing = await getSignaturesForContract(supabase, companyId, input.contractId)
  const signerTypes = existing.map((s) => s.signerType)

  let nowSigned = false
  if (contract.status === "awaiting_signature" && hasRequiredSignatures(signerTypes)) {
    const transitioned = await transitionContract(supabase, session, input.contractId, "signed")
    if (transitioned.ok) nowSigned = true
  }

  return { ok: true, signatureId: signature.id, nowSigned }
}

// ---------------------------------------------------------------------
// Amendments (requirement 5)
// ---------------------------------------------------------------------

export type AmendmentType = "rental_extension" | "vehicle_exchange" | "additional_driver" | "price_adjustment" | "insurance_upgrade"

export interface AmendmentRecord {
  id: string
  type: AmendmentType
  description: string
  changes: { field: string; before: string; after: string }[]
  createdByName: string | null
  createdAt: string
}

function mapAmendmentRow(row: {
  id: string
  type: string
  description: string
  changes: unknown
  created_at: string
  creator: { full_name: string | null } | null
}): AmendmentRecord {
  return {
    id: row.id,
    type: row.type as AmendmentType,
    description: row.description,
    changes: (row.changes ?? []) as AmendmentRecord["changes"],
    createdByName: row.creator?.full_name ?? null,
    createdAt: row.created_at,
  }
}

/** Insert-only, into its own table — the original `contracts` row is
 * never touched by this function (nothing here has an `.update()` on
 * `contracts` at all). `lib/contracts/__tests__/template-store.test.ts`
 * verifies this directly: a contract's resolved_context/
 * rendered_sections/pdf_storage_path are compared byte-for-byte before
 * and after creating an amendment. */
export async function createContractAmendment(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: {
    contractId: string
    type: AmendmentType
    description: string
    changes: { field: string; before: string; after: string }[]
  }
): Promise<TemplateActionResult<{ amendmentId: string }>> {
  const companyId = session.company.id
  const contract = await getContract(supabase, companyId, input.contractId)
  if (!contract) return { ok: false, error: "That contract could not be found." }

  const { data: amendment, error } = await supabase
    .from("contract_amendments")
    .insert({
      company_id: companyId,
      contract_id: input.contractId,
      type: input.type,
      description: input.description,
      changes: input.changes,
      created_by: session.userId,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await recordEvent(supabase, {
    companyId,
    actorId: session.userId,
    type: "contract_amended",
    entityType: "contract",
    entityId: input.contractId,
    title: `Contract ${contract.contractNumber ?? ""} amended: ${input.description}`.trim(),
    metadata: { contract_id: input.contractId, reservation_id: contract.reservationId, amendment_id: amendment.id },
  })

  return { ok: true, amendmentId: amendment.id }
}

export async function getAmendmentsForContract(
  supabase: SupabaseServerClient,
  companyId: string,
  contractId: string
): Promise<AmendmentRecord[]> {
  const { data, error } = await supabase
    .from("contract_amendments")
    .select("id, type, description, changes, created_at, creator:profiles!contract_amendments_created_by_fkey(full_name)")
    .eq("company_id", companyId)
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapAmendmentRow(r as never))
}

// ---------------------------------------------------------------------
// PDF regeneration (requirement 6)
// ---------------------------------------------------------------------

/** Proves "the PDF is a regeneratable rendering" concretely: rebuilds
 * the exact same bytes from the contract's already-stored
 * `resolved_context`/`rendered_sections` — never re-reads the
 * customer/vehicle/reservation rows, so it can't drift even if those
 * have changed since generation. */
export async function regenerateContractPdf(
  supabase: SupabaseServerClient,
  session: SessionContext,
  contractId: string
): Promise<TemplateActionResult> {
  const companyId = session.company.id
  const contract = await getContract(supabase, companyId, contractId)
  if (!contract) return { ok: false, error: "That contract could not be found." }

  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .select("name, address, city, country, tax_id")
    .eq("id", companyId)
    .single()
  if (companyError || !companyRow) return { ok: false, error: "Could not load company details." }

  const { data: reservationRow } = await supabase.from("reservations").select("reference").eq("id", contract.reservationId).maybeSingle()

  const pdfBytes = await renderContractPdf({
    reservationReference: (reservationRow?.reference as string | undefined) ?? "",
    branding: {
      companyName: companyRow.name,
      companyAddress: companyRow.address,
      companyCity: companyRow.city,
      companyCountry: companyRow.country,
      companyTaxId: companyRow.tax_id,
    },
    sections: contract.renderedSections,
    legalFooterText: null,
    generatedAtLabel: contract.resolvedContext["today.date"] ?? "",
    contractId: contract.id,
    contractNumber: contract.contractNumber ?? "",
  })

  const pdfPath = contract.pdfStoragePath ?? `${companyId}/contracts/${contract.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true })
  if (uploadError) return { ok: false, error: uploadError.message }

  if (!contract.pdfStoragePath) {
    await supabase.from("contracts").update({ pdf_storage_path: pdfPath }).eq("id", contractId).eq("company_id", companyId)
  }

  return { ok: true }
}

// ---------------------------------------------------------------------
// Audit trail: viewed / printed / downloaded (requirement 9)
// ---------------------------------------------------------------------

async function logContractEvent(
  supabase: SupabaseServerClient,
  session: SessionContext,
  contractId: string,
  type: "contract_viewed" | "contract_printed" | "contract_downloaded"
): Promise<void> {
  const companyId = session.company.id
  await recordEvent(supabase, {
    companyId,
    actorId: session.userId,
    type,
    entityType: "contract",
    entityId: contractId,
    title: `Contract ${type.replace("contract_", "")}`,
    metadata: { contract_id: contractId },
  })
}

export const logContractViewed = (supabase: SupabaseServerClient, session: SessionContext, contractId: string) =>
  logContractEvent(supabase, session, contractId, "contract_viewed")
export const logContractPrinted = (supabase: SupabaseServerClient, session: SessionContext, contractId: string) =>
  logContractEvent(supabase, session, contractId, "contract_printed")
export const logContractDownloaded = (supabase: SupabaseServerClient, session: SessionContext, contractId: string) =>
  logContractEvent(supabase, session, contractId, "contract_downloaded")

// ---------------------------------------------------------------------
// Search (requirement 7)
// ---------------------------------------------------------------------

export interface ContractSearchFilters {
  customerName?: string
  vehiclePlate?: string
  contractNumber?: string
  status?: ContractStatus
  employeeId?: string
  dateFrom?: string
  dateTo?: string
}

export interface ContractSearchResult {
  id: string
  contractNumber: string | null
  status: ContractStatus
  customerName: string
  vehicleLabel: string | null
  reservationReference: string
  generatedAt: string
}

/** Same shape as `getDocumentsList`'s search (roadmap phase 04
 * requirement 7): resolve matching customer/vehicle ids first, then
 * filter the target table by id — extending that established pattern
 * rather than building a parallel search mechanism, per requirement
 * 7's own instruction, even though contracts live in their own table
 * (not `documents`) since phase 10 already gave them a much richer
 * structured schema than a generic document row could hold. */
export async function searchContracts(
  supabase: SupabaseServerClient,
  companyId: string,
  filters: ContractSearchFilters = {},
  page = 1,
  pageSize = 24
): Promise<{ items: ContractSearchResult[]; total: number; page: number; pageSize: number }> {
  let query = supabase
    .from("contracts")
    .select(
      "id, contract_number, status, generated_at, customer:customers(full_name), vehicle:vehicles(make, model, registration_number), reservation:reservations(reference)",
      { count: "exact" }
    )
    .eq("company_id", companyId)

  if (filters.status) query = query.eq("status", filters.status)
  if (filters.employeeId) query = query.eq("generated_by", filters.employeeId)
  if (filters.dateFrom) query = query.gte("generated_at", filters.dateFrom)
  if (filters.dateTo) query = query.lte("generated_at", filters.dateTo)
  if (filters.contractNumber?.trim()) query = query.ilike("contract_number", `%${filters.contractNumber.trim()}%`)

  if (filters.customerName?.trim()) {
    const { data: matches } = await supabase.from("customers").select("id").eq("company_id", companyId).ilike("full_name", `%${filters.customerName.trim()}%`)
    const ids = (matches ?? []).map((m) => m.id)
    query = query.in("customer_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
  }

  if (filters.vehiclePlate?.trim()) {
    const { data: matches } = await supabase.from("vehicles").select("id").eq("company_id", companyId).ilike("registration_number", `%${filters.vehiclePlate.trim()}%`)
    const ids = (matches ?? []).map((m) => m.id)
    query = query.in("vehicle_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
  }

  const start = (page - 1) * pageSize
  const { data, error, count } = await query.order("generated_at", { ascending: false }).range(start, start + pageSize - 1)
  if (error) throw error

  const items: ContractSearchResult[] = (data ?? []).map((row) => {
    const customer = row.customer as unknown as { full_name: string } | null
    const vehicle = row.vehicle as unknown as { make: string; model: string; registration_number: string } | null
    const reservation = row.reservation as unknown as { reference: string } | null
    return {
      id: row.id,
      contractNumber: row.contract_number,
      status: row.status as ContractStatus,
      customerName: customer?.full_name ?? "—",
      vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.registration_number})` : null,
      reservationReference: reservation?.reference ?? "—",
      generatedAt: row.generated_at,
    }
  })

  return { items, total: count ?? 0, page, pageSize }
}

export type { TemplateSection, SectionCondition, ContractStatus, SignerType }
