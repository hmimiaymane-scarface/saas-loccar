import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import { STORAGE_BUCKET } from "@/lib/storage"
import { recordEvent } from "@/lib/activity-log"
import { extractPdfText } from "@/lib/contracts/pdf-extract"
import { proposeContractTemplateMapping } from "@/lib/contracts/template-ai"
import { isKnownContractField } from "@/lib/contracts/variables"
import { buildContractContext } from "@/lib/contracts/context"
import { renderContractSections, type TemplateSection, type SectionCondition } from "@/lib/contracts/template-engine"
import { renderContractPdf } from "@/lib/contracts/pdf-render"

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

/**
 * Requirement 3 — generates a contract for one reservation against one
 * template's currently-active version, resolves every variable from
 * real rows, renders the sections, produces a PDF, and stores all of
 * it. `resolved_context`/`rendered_sections` are a permanent snapshot:
 * even if the customer/vehicle/reservation rows are edited afterward,
 * this contract's displayed content never silently changes.
 */
export async function generateContract(
  supabase: SupabaseServerClient,
  session: SessionContext,
  input: { reservationId: string; templateId?: string }
): Promise<TemplateActionResult<{ contractId: string }>> {
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

  const { data: depositRow } = await supabase
    .from("deposits")
    .select("expected_amount, collected_amount")
    .eq("company_id", companyId)
    .eq("reservation_id", input.reservationId)
    .maybeSingle()

  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .select("name, address, city, country, tax_id, business_register")
    .eq("id", companyId)
    .single()
  if (companyError || !companyRow) return { ok: false, error: "Could not load company details." }

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

  const pdfBytes = await renderContractPdf({
    reservationReference: reservationRow.reference as string,
    branding: {
      companyName: companyRow.name,
      companyAddress: companyRow.address,
      companyCity: companyRow.city,
      companyCountry: companyRow.country,
      companyTaxId: companyRow.tax_id,
    },
    sections: renderedSections,
    legalFooterText: version.legalFooterText,
    generatedAtLabel: context["today.date"],
  })

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      company_id: companyId,
      reservation_id: input.reservationId,
      template_version_id: version.id,
      customer_id: customer.id,
      vehicle_id: vehicleRow?.id ?? null,
      resolved_context: context,
      rendered_sections: renderedSections,
      generated_by: session.userId,
    })
    .select("id")
    .single()
  if (contractError) return { ok: false, error: contractError.message }

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
    title: `Contract generated for ${reservationRow.reference}`,
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
}

const CONTRACT_SELECT =
  "id, reservation_id, customer_id, vehicle_id, template_version_id, rendered_sections, pdf_storage_path, generated_at, generator:profiles!contracts_generated_by_fkey(full_name)"

function mapContractRow(row: {
  id: string
  reservation_id: string
  customer_id: string
  vehicle_id: string | null
  template_version_id: string
  rendered_sections: unknown
  pdf_storage_path: string | null
  generated_at: string
  generator: { full_name: string | null } | null
}): ContractRecord {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    templateVersionId: row.template_version_id,
    renderedSections: (row.rendered_sections ?? []) as ContractRecord["renderedSections"],
    pdfStoragePath: row.pdf_storage_path,
    generatedAt: row.generated_at,
    generatedByName: row.generator?.full_name ?? null,
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

export type { TemplateSection, SectionCondition }
