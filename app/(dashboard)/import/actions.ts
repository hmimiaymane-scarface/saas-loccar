"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { getVehiclePlatesForImport, getCustomerPoolForImport, getImportBatches, type ImportBatchSummary } from "@/lib/data"
import type { ExistingCustomerRecord } from "@/lib/customer-matching"
import type { VehicleImportData } from "@/lib/import/vehicle-import"
import type { CustomerImportData } from "@/lib/import/customer-import"

/**
 * Roadmap phase 48 (Excel/CSV Importer). Gated tighter than either
 * entity's own single-record create action (fleet: owner/manager;
 * customers: owner/manager/agent) -- a bulk import is a materially
 * higher-blast-radius operation than adding one record by hand, so
 * this deliberately narrows to owner/manager for both entities, not
 * just the stricter of the two.
 */
const IMPORT_ROLES = ["owner", "manager"] as const

export interface DedupPoolResult<T> {
  error?: string
  data?: T
}

export async function getVehicleDedupPool(): Promise<DedupPoolResult<string[]>> {
  try {
    const session = await requireSession()
    requireRole(session, [...IMPORT_ROLES])
    const plates = await getVehiclePlatesForImport(session.company.id)
    return { data: plates }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function getCustomerDedupPool(): Promise<DedupPoolResult<ExistingCustomerRecord[]>> {
  try {
    const session = await requireSession()
    requireRole(session, [...IMPORT_ROLES])
    const pool = await getCustomerPoolForImport(session.company.id)
    return { data: pool }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface ImportCommitResult {
  error?: string
  batchId?: string
  insertedCount?: number
  rowErrors?: RowError[]
}

/** Inserts every row one at a time (no batch-insert precedent exists
 * elsewhere in this app -- see docs/company-data-import.md), so one
 * row's own DB-level failure (e.g. a plate that collided with another
 * import that landed between preview and commit) never blocks the
 * rest of an otherwise-good file. Every row is tagged with the new
 * batch's id whether it succeeds or not tracked -- only successes get
 * tagged, obviously, since a failed insert created no row to tag. */
export async function commitVehicleImport(rows: { rowNumber: number; data: VehicleImportData }[]): Promise<ImportCommitResult> {
  try {
    const session = await requireSession()
    requireRole(session, [...IMPORT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (rows.length === 0) {
      throw new ActionError("No valid rows to import.")
    }

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({ company_id: companyId, entity_type: "vehicle", created_by: session.userId })
      .select("id")
      .single()

    if (batchError) return { error: friendlyDbError(batchError) }
    const batchId = batch.id as string

    let insertedCount = 0
    const rowErrors: RowError[] = []

    for (const row of rows) {
      const { error } = await supabase.from("vehicles").insert({
        company_id: companyId,
        import_batch_id: batchId,
        registration_number: row.data.registrationNumber,
        make: row.data.make,
        model: row.data.model,
        year: row.data.year,
        category: row.data.category,
        fuel_type: row.data.fuelType,
        transmission: row.data.transmission,
        color: row.data.color,
        seats: row.data.seats,
        odometer_km: row.data.odometerKm,
        daily_rate: row.data.dailyRate,
        deposit_amount: row.data.depositAmount,
        insurance_expires_on: row.data.insuranceExpiresOn,
        registration_expires_on: row.data.registrationExpiresOn,
        inspection_expires_on: row.data.inspectionExpiresOn,
      })

      if (error) rowErrors.push({ rowNumber: row.rowNumber, message: friendlyDbError(error) })
      else insertedCount++
    }

    await supabase.from("import_batches").update({ row_count: insertedCount, error_count: rowErrors.length }).eq("id", batchId)

    if (insertedCount > 0) {
      await recordEvent(supabase, {
        companyId,
        actorId: session.userId,
        type: "vehicles_imported",
        entityType: "import_batch",
        entityId: batchId,
        title: `${insertedCount} vehicle${insertedCount === 1 ? "" : "s"} imported`,
        description: rowErrors.length > 0 ? `${rowErrors.length} row(s) failed to import` : undefined,
        metadata: { rowCount: insertedCount, errorCount: rowErrors.length },
      })
    }

    revalidatePath("/fleet")
    revalidatePath("/overview")
    revalidatePath("/import")

    return { batchId, insertedCount, rowErrors }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function commitCustomerImport(rows: { rowNumber: number; data: CustomerImportData }[]): Promise<ImportCommitResult> {
  try {
    const session = await requireSession()
    requireRole(session, [...IMPORT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (rows.length === 0) {
      throw new ActionError("No valid rows to import.")
    }

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({ company_id: companyId, entity_type: "customer", created_by: session.userId })
      .select("id")
      .single()

    if (batchError) return { error: friendlyDbError(batchError) }
    const batchId = batch.id as string

    let insertedCount = 0
    const rowErrors: RowError[] = []

    for (const row of rows) {
      const { error } = await supabase.from("customers").insert({
        company_id: companyId,
        import_batch_id: batchId,
        full_name: row.data.fullName,
        phone: row.data.phone,
        email: row.data.email,
        nationality: row.data.nationality,
        id_document_number: row.data.idDocumentNumber,
        license_number: row.data.licenseNumber,
        license_expires_on: row.data.licenseExpiresOn,
        date_of_birth: row.data.dateOfBirth,
        address: row.data.address,
        notes: row.data.notes,
      })

      if (error) rowErrors.push({ rowNumber: row.rowNumber, message: friendlyDbError(error) })
      else insertedCount++
    }

    await supabase.from("import_batches").update({ row_count: insertedCount, error_count: rowErrors.length }).eq("id", batchId)

    if (insertedCount > 0) {
      await recordEvent(supabase, {
        companyId,
        actorId: session.userId,
        type: "customers_imported",
        entityType: "import_batch",
        entityId: batchId,
        title: `${insertedCount} customer${insertedCount === 1 ? "" : "s"} imported`,
        description: rowErrors.length > 0 ? `${rowErrors.length} row(s) failed to import` : undefined,
        metadata: { rowCount: insertedCount, errorCount: rowErrors.length },
      })
    }

    revalidatePath("/customers")
    revalidatePath("/overview")
    revalidatePath("/import")

    return { batchId, insertedCount, rowErrors }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export interface UndoImportResult {
  error?: string
  removedCount?: number
  remainingCount?: number
  fullyUndone?: boolean
}

/**
 * Best-effort, per-row delete loop -- not one bulk `delete().eq(...)`
 * statement -- specifically so a single row that's since become
 * referenced (e.g. an imported vehicle now has a reservation, an
 * imported customer now has one too) doesn't block removing every
 * other row in the same batch. Only sets `undone_at` once the batch is
 * *fully* empty, so a partially-blocked undo can simply be retried
 * later (e.g. after that reservation is cancelled) instead of being
 * permanently stuck half-done.
 */
export async function undoImportBatch(batchId: string): Promise<UndoImportResult> {
  try {
    const session = await requireSession()
    requireRole(session, [...IMPORT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .select("id, entity_type, undone_at")
      .eq("id", batchId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (batchError) return { error: friendlyDbError(batchError) }
    if (!batch) throw new ActionError("Import batch not found.")
    if (batch.undone_at) throw new ActionError("This import was already fully undone.")

    const table = batch.entity_type === "vehicle" ? "vehicles" : "customers"

    const { data: rowsToRemove, error: rowsError } = await supabase
      .from(table)
      .select("id")
      .eq("import_batch_id", batchId)
      .eq("company_id", companyId)

    if (rowsError) return { error: friendlyDbError(rowsError) }

    let removedCount = 0
    for (const row of rowsToRemove ?? []) {
      const { error } = await supabase.from(table).delete().eq("id", row.id as string).eq("company_id", companyId)
      if (!error) removedCount++
    }

    const remainingCount = (rowsToRemove?.length ?? 0) - removedCount
    const fullyUndone = remainingCount === 0

    if (fullyUndone) {
      await supabase.from("import_batches").update({ undone_at: new Date().toISOString() }).eq("id", batchId)
    }

    revalidatePath("/fleet")
    revalidatePath("/customers")
    revalidatePath("/overview")
    revalidatePath("/import")

    return { removedCount, remainingCount, fullyUndone }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function getRecentImportBatches(): Promise<ImportBatchSummary[]> {
  const session = await requireSession()
  requireRole(session, [...IMPORT_ROLES])
  return getImportBatches(session.company.id)
}
