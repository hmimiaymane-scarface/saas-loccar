"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import {
  proposeTemplateFromUpload,
  createEditedVersion,
  activateVersion,
  type VariableMapping,
} from "@/lib/contracts/template-store"
import { generateContract } from "@/lib/contracts/template-store"
import type { TemplateSection } from "@/lib/contracts/template-engine"

const TEMPLATE_ROLES = ["owner", "manager"] as const
const GENERATE_ROLES = ["owner", "manager", "agent"] as const

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
