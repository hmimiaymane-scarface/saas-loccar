"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { requireSession, requireRole } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import {
  proposeTemplateFromUpload,
  createEditedVersion,
  activateVersion,
  generateContract,
  previewContract,
  prepareContract,
  sendContractForSignature,
  addContractSignature,
  activateContract,
  completeContract,
  archiveContract,
  cancelContract,
  createContractAmendment,
  regenerateContractPdf,
  logContractViewed,
  logContractPrinted,
  logContractDownloaded,
  type VariableMapping,
  type ContractPreview,
  type SignerType,
  type AmendmentType,
} from "@/lib/contracts/template-store"
import type { TemplateSection } from "@/lib/contracts/template-engine"

const TEMPLATE_ROLES = ["owner", "manager"] as const
const GENERATE_ROLES = ["owner", "manager", "agent"] as const

/** Best-effort — a signature/audit record shouldn't fail just because
 * a header happened to be missing (e.g. behind a proxy that doesn't
 * forward it). */
async function requestContext(): Promise<{ deviceInfo: string | null; ipAddress: string | null }> {
  const h = await headers()
  return {
    deviceInfo: h.get("user-agent"),
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  }
}

export async function proposeTemplateAction(input: {
  name: string
  language: string
  storagePath: string
}): Promise<{ ok: true; templateId: string; versionId: string } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...TEMPLATE_ROLES])
  const supabase = await createClient()
  const result = await proposeTemplateFromUpload(supabase, session, input)
  if (result.ok) revalidatePath("/contract-templates")
  return result
}

export async function saveEditedVersionAction(input: {
  templateId: string
  sections: TemplateSection[]
  variableMappings: VariableMapping[]
  legalFooterText: string | null
  activateImmediately: boolean
}): Promise<{ ok: true; versionId: string } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...TEMPLATE_ROLES])
  const supabase = await createClient()

  const created = await createEditedVersion(supabase, session, {
    templateId: input.templateId,
    sections: input.sections,
    variableMappings: input.variableMappings,
    legalFooterText: input.legalFooterText,
  })
  if (!created.ok) return created

  if (input.activateImmediately) {
    const activated = await activateVersion(supabase, session, created.versionId)
    if (!activated.ok) return activated
  }

  revalidatePath(`/contract-templates/${input.templateId}`)
  revalidatePath("/contract-templates")
  return created
}

export async function activateVersionAction(
  templateId: string,
  versionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...TEMPLATE_ROLES])
  const supabase = await createClient()
  const result = await activateVersion(supabase, session, versionId)
  if (result.ok) {
    revalidatePath(`/contract-templates/${templateId}`)
    revalidatePath("/contract-templates")
  }
  return result
}

export async function previewContractAction(
  reservationId: string,
  templateId?: string
): Promise<{ ok: true } & ContractPreview | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...GENERATE_ROLES])
  const supabase = await createClient()
  return previewContract(supabase, session, { reservationId, templateId })
}

export async function generateContractAction(
  reservationId: string,
  templateId?: string
): Promise<{ ok: true; contractId: string } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...GENERATE_ROLES])
  const supabase = await createClient()
  const result = await generateContract(supabase, session, { reservationId, templateId })
  if (result.ok) revalidatePath(`/reservations/${reservationId}`)
  return result
}

// ---------------------------------------------------------------------
// Lifecycle (roadmap phase 11)
// ---------------------------------------------------------------------

async function runLifecycleAction(
  contractId: string,
  action: (supabase: Awaited<ReturnType<typeof createClient>>, session: Awaited<ReturnType<typeof requireSession>>) => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...GENERATE_ROLES])
  const supabase = await createClient()
  const result = await action(supabase, session)
  if (result.ok) revalidatePath(`/contracts/${contractId}`)
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "That action failed." }
}

// Next.js's "use server" export scanner requires plain `async
// function` declarations — a `const X = (...) => ...` arrow wrapping
// the shared helper above type-checks fine but fails at build time
// ("export ... was not found in module"), so each of these is a real
// function declaration even though the body is one line.
export async function prepareContractAction(contractId: string) {
  return runLifecycleAction(contractId, (s, session) => prepareContract(s, session, contractId))
}
export async function sendContractForSignatureAction(contractId: string) {
  return runLifecycleAction(contractId, (s, session) => sendContractForSignature(s, session, contractId))
}
export async function activateContractAction(contractId: string) {
  return runLifecycleAction(contractId, (s, session) => activateContract(s, session, contractId))
}
export async function completeContractAction(contractId: string) {
  return runLifecycleAction(contractId, (s, session) => completeContract(s, session, contractId))
}
export async function archiveContractAction(contractId: string) {
  return runLifecycleAction(contractId, (s, session) => archiveContract(s, session, contractId))
}
export async function cancelContractAction(contractId: string, reason: string) {
  return runLifecycleAction(contractId, (s, session) => cancelContract(s, session, contractId, reason))
}

export async function addSignatureAction(input: {
  contractId: string
  signerType: SignerType
  signerName: string
}): Promise<{ ok: true; nowSigned: boolean } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...GENERATE_ROLES])
  const supabase = await createClient()
  const { deviceInfo, ipAddress } = await requestContext()
  const result = await addContractSignature(supabase, session, { ...input, deviceInfo, ipAddress })
  if (result.ok) revalidatePath(`/contracts/${input.contractId}`)
  return result.ok ? { ok: true, nowSigned: result.nowSigned } : result
}

export async function createAmendmentAction(input: {
  contractId: string
  type: AmendmentType
  description: string
  changes: { field: string; before: string; after: string }[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...GENERATE_ROLES])
  const supabase = await createClient()
  const result = await createContractAmendment(supabase, session, input)
  if (result.ok) revalidatePath(`/contracts/${input.contractId}`)
  return result.ok ? { ok: true } : result
}

export async function regenerateContractPdfAction(contractId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession()
  requireRole(session, [...GENERATE_ROLES])
  const supabase = await createClient()
  const result = await regenerateContractPdf(supabase, session, contractId)
  if (result.ok) revalidatePath(`/contracts/${contractId}`)
  return result
}

export async function logContractViewedAction(contractId: string): Promise<void> {
  const session = await requireSession()
  const supabase = await createClient()
  await logContractViewed(supabase, session, contractId)
}

export async function logContractPrintedAction(contractId: string): Promise<void> {
  const session = await requireSession()
  const supabase = await createClient()
  await logContractPrinted(supabase, session, contractId)
}

export async function logContractDownloadedAction(contractId: string): Promise<void> {
  const session = await requireSession()
  const supabase = await createClient()
  await logContractDownloaded(supabase, session, contractId)
}
