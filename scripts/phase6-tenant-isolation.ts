/**
 * Productization wave 1 phase 6 — "Prove that one company cannot
 * access another company's data," verified against real Postgres (the
 * live project phase 5 migrated), not just by reading RLS policy SQL.
 *
 * Creates two real companies, two real owner users and one real staff
 * user via Supabase Auth, seeds one row in every table the phase names
 * (vehicles, customers, reservations, payments, documents, contracts —
 * plus the contract_templates/contract_template_versions chain
 * contracts requires) for Company A, then — using each user's own
 * authenticated session through the anon key, exactly the path a real
 * request takes, never the service-role key for the actual checks —
 * attempts cross-company reads and writes and records what Postgres
 * actually did. Setup/teardown use the service-role key (bypassing RLS
 * is fine for fixtures; it's the checks themselves that must go through
 * a real user session for this to mean anything).
 *
 * Run: node --env-file=.env.local -r ./scripts/register-tsx.js scripts/phase6-tenant-isolation.ts
 * (invoked via `npx tsx --env-file=.env.local scripts/phase6-tenant-isolation.ts` in practice)
 *
 * Cleans up everything it creates in a `finally` block, including the
 * three auth.users rows, so this leaves no permanent trace on the
 * project regardless of pass/fail.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"

// Minimal inline .env.local loader — avoids depending on Node/tsx flag
// support for this one-off script; only sets vars not already present
// in the environment.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY")
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const RUN_ID = randomUUID().slice(0, 8)
const PASSWORD = `Phase6-${randomUUID()}`

interface Check {
  label: string
  expected: string
  actual: string
  pass: boolean
}
const checks: Check[] = []

function record(label: string, expected: string, pass: boolean, actual: string) {
  checks.push({ label, expected, actual, pass })
  console.log(`${pass ? "PASS" : "FAIL"} — ${label} (expected: ${expected}, got: ${actual})`)
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

async function main() {
  console.log(`\n=== Phase 6 tenant isolation test run ${RUN_ID} ===\n`)

  // ---------------------------------------------------------------
  // Setup (service role — bypassing RLS is fine for fixtures only)
  // ---------------------------------------------------------------
  const owner1Email = `phase6-owner-a-${RUN_ID}@example.com`
  const owner2Email = `phase6-owner-b-${RUN_ID}@example.com`
  const staff1Email = `phase6-staff-a-${RUN_ID}@example.com`

  const { data: owner1User, error: e1 } = await admin.auth.admin.createUser({ email: owner1Email, password: PASSWORD, email_confirm: true })
  if (e1 || !owner1User.user) throw new Error(`createUser owner1 failed: ${e1?.message}`)
  const { data: owner2User, error: e2 } = await admin.auth.admin.createUser({ email: owner2Email, password: PASSWORD, email_confirm: true })
  if (e2 || !owner2User.user) throw new Error(`createUser owner2 failed: ${e2?.message}`)
  const { data: staff1User, error: e3 } = await admin.auth.admin.createUser({ email: staff1Email, password: PASSWORD, email_confirm: true })
  if (e3 || !staff1User.user) throw new Error(`createUser staff1 failed: ${e3?.message}`)

  const ownerAId = owner1User.user.id
  const ownerBId = owner2User.user.id
  const staffAId = staff1User.user.id
  console.log(`Created 3 test users: ownerA=${ownerAId} ownerB=${ownerBId} staffA=${staffAId}`)

  const createdCompanyIds: string[] = []

  try {
    const { data: companyA, error: caErr } = await admin
      .from("companies")
      .insert({ name: `Phase6 Co A ${RUN_ID}`, slug: `phase6-co-a-${RUN_ID}`, currency: "MAD", default_language: "fr", status: "active" })
      .select()
      .single()
    if (caErr || !companyA) throw new Error(`create companyA failed: ${caErr?.message}`)
    const { data: companyB, error: cbErr } = await admin
      .from("companies")
      .insert({ name: `Phase6 Co B ${RUN_ID}`, slug: `phase6-co-b-${RUN_ID}`, currency: "MAD", default_language: "fr", status: "active" })
      .select()
      .single()
    if (cbErr || !companyB) throw new Error(`create companyB failed: ${cbErr?.message}`)
    createdCompanyIds.push(companyA.id, companyB.id)
    console.log(`Created companies: A=${companyA.id} B=${companyB.id}`)

    const { error: memErr } = await admin.from("company_memberships").insert([
      { company_id: companyA.id, user_id: ownerAId, role: "owner", status: "active" },
      { company_id: companyB.id, user_id: ownerBId, role: "owner", status: "active" },
      { company_id: companyA.id, user_id: staffAId, role: "manager", status: "active" },
    ])
    if (memErr) throw new Error(`memberships failed: ${memErr.message}`)

    const { data: branchA, error: brErr } = await admin
      .from("branches")
      .insert({ company_id: companyA.id, name: "Main branch", is_main: true })
      .select()
      .single()
    if (brErr || !branchA) throw new Error(`branchA failed: ${brErr?.message}`)

    // --- Seed Company A: vehicle, customer, reservation, payment, document, contract chain ---
    const { data: vehicleA, error: vErr } = await admin
      .from("vehicles")
      .insert({
        company_id: companyA.id,
        branch_id: branchA.id,
        registration_number: `A-${RUN_ID}`,
        make: "Dacia",
        model: "Logan",
        year: 2022,
        category: "economy",
        daily_rate: 250,
      })
      .select()
      .single()
    if (vErr || !vehicleA) throw new Error(`vehicleA failed: ${vErr?.message}`)

    const { data: customerA, error: cuErr } = await admin
      .from("customers")
      .insert({ company_id: companyA.id, full_name: "Phase6 Test Customer A", phone: "+212600000001" })
      .select()
      .single()
    if (cuErr || !customerA) throw new Error(`customerA failed: ${cuErr?.message}`)

    const pickup = new Date()
    const ret = new Date(pickup.getTime() + 2 * 24 * 60 * 60 * 1000)
    const { data: reservationA, error: rErr } = await admin
      .from("reservations")
      .insert({
        company_id: companyA.id,
        branch_id: branchA.id,
        customer_id: customerA.id,
        vehicle_id: vehicleA.id,
        reference: `PH6-${RUN_ID}`,
        pickup_at: pickup.toISOString(),
        return_at: ret.toISOString(),
        status: "confirmed",
        daily_rate: 250,
        num_days: 2,
        total_amount: 500,
      })
      .select()
      .single()
    if (rErr || !reservationA) throw new Error(`reservationA failed: ${rErr?.message}`)

    const { data: paymentA, error: pErr } = await admin
      .from("payments")
      .insert({ company_id: companyA.id, reservation_id: reservationA.id, customer_id: customerA.id, amount: 500, method: "cash", transaction_type: "rental_payment" })
      .select()
      .single()
    if (pErr || !paymentA) throw new Error(`paymentA failed: ${pErr?.message}`)

    const { data: documentA, error: dErr } = await admin
      .from("documents")
      .insert({
        company_id: companyA.id,
        reservation_id: reservationA.id,
        category: "rental_contract",
        storage_path: `${companyA.id}/rental_contract/phase6-${RUN_ID}.pdf`,
        original_filename: "phase6-test.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      })
      .select()
      .single()
    if (dErr || !documentA) throw new Error(`documentA failed: ${dErr?.message}`)

    const { data: templateA, error: tErr } = await admin
      .from("contract_templates")
      .insert({ company_id: companyA.id, name: `Phase6 Template ${RUN_ID}` })
      .select()
      .single()
    if (tErr || !templateA) throw new Error(`templateA failed: ${tErr?.message}`)

    const { data: templateVersionA, error: tvErr } = await admin
      .from("contract_template_versions")
      .insert({ template_id: templateA.id, company_id: companyA.id, version_number: 1, status: "active", sections: [], variable_mappings: [] })
      .select()
      .single()
    if (tvErr || !templateVersionA) throw new Error(`templateVersionA failed: ${tvErr?.message}`)

    const { data: contractA, error: cErr } = await admin
      .from("contracts")
      .insert({
        company_id: companyA.id,
        reservation_id: reservationA.id,
        template_version_id: templateVersionA.id,
        customer_id: customerA.id,
        vehicle_id: vehicleA.id,
        resolved_context: {},
        rendered_sections: [],
      })
      .select()
      .single()
    if (cErr || !contractA) throw new Error(`contractA failed: ${cErr?.message}`)

    console.log("Seeded Company A: vehicle, customer, reservation, payment, document, contract (+ template chain)\n")

    // --- Seed Company B with its own vehicle (positive-control target for owner2's own reads) ---
    const { data: vehicleB, error: vbErr } = await admin
      .from("vehicles")
      .insert({ company_id: companyB.id, registration_number: `B-${RUN_ID}`, make: "Renault", model: "Clio", year: 2021, category: "economy", daily_rate: 200 })
      .select()
      .single()
    if (vbErr || !vehicleB) throw new Error(`vehicleB failed: ${vbErr?.message}`)

    // ---------------------------------------------------------------
    // Real sessions — everything from here on goes through the anon
    // key + a real signed-in JWT, exactly the path a real request
    // takes. This is what actually exercises RLS.
    // ---------------------------------------------------------------
    const asOwnerA = await signedInClient(owner1Email, PASSWORD)
    const asOwnerB = await signedInClient(owner2Email, PASSWORD)
    const asStaffA = await signedInClient(staff1Email, PASSWORD)

    // --- Positive controls: each user can see their OWN company's data ---
    {
      const { data } = await asOwnerA.from("vehicles").select("id").eq("id", vehicleA.id)
      record("owner A reads own company's vehicle", "1 row", (data ?? []).length === 1, `${(data ?? []).length} row(s)`)
    }
    {
      const { data } = await asOwnerB.from("vehicles").select("id").eq("id", vehicleB.id)
      record("owner B reads own company's vehicle", "1 row", (data ?? []).length === 1, `${(data ?? []).length} row(s)`)
    }
    {
      const { data } = await asStaffA.from("vehicles").select("id").eq("id", vehicleA.id)
      record("staff A (Company A member) reads Company A's vehicle", "1 row", (data ?? []).length === 1, `${(data ?? []).length} row(s)`)
    }

    // --- Cross-tenant READ attempts: owner B against every Company A table ---
    const crossReadTargets: { table: string; id: string }[] = [
      { table: "vehicles", id: vehicleA.id },
      { table: "customers", id: customerA.id },
      { table: "reservations", id: reservationA.id },
      { table: "payments", id: paymentA.id },
      { table: "documents", id: documentA.id },
      { table: "contracts", id: contractA.id },
    ]
    for (const { table, id } of crossReadTargets) {
      const { data, error } = await asOwnerB.from(table).select("id").eq("id", id)
      const leaked = !error && (data ?? []).length > 0
      record(`owner B reads Company A's ${table} by id`, "0 rows (denied by RLS)", !leaked, error ? `error: ${error.message}` : `${(data ?? []).length} row(s)`)
    }

    // --- Cross-tenant READ attempts: staff A (Company A) against Company B ---
    {
      const { data, error } = await asStaffA.from("vehicles").select("id").eq("id", vehicleB.id)
      const leaked = !error && (data ?? []).length > 0
      record("staff A reads Company B's vehicle", "0 rows (denied by RLS)", !leaked, error ? `error: ${error.message}` : `${(data ?? []).length} row(s)`)
    }

    // --- Cross-tenant WRITE attempts: owner B against Company A's rows ---
    {
      const { data, error } = await asOwnerB.from("vehicles").update({ daily_rate: 1 }).eq("id", vehicleA.id).select("id")
      const blocked = !!error || (data ?? []).length === 0
      record("owner B updates Company A's vehicle", "0 rows affected / denied", blocked, error ? `error: ${error.message}` : `${(data ?? []).length} row(s) affected`)
    }
    {
      const { data, error } = await asOwnerB.from("customers").delete().eq("id", customerA.id).select("id")
      const blocked = !!error || (data ?? []).length === 0
      record("owner B deletes Company A's customer", "0 rows affected / denied", blocked, error ? `error: ${error.message}` : `${(data ?? []).length} row(s) affected`)
    }
    {
      // Forged tenant claim: owner B tries to insert a payment tagged with Company A's id.
      const { error } = await asOwnerB
        .from("payments")
        .insert({ company_id: companyA.id, customer_id: customerA.id, amount: 999, method: "cash", transaction_type: "rental_payment" })
      record("owner B inserts a payment forging Company A's company_id", "insert rejected", !!error, error ? `error: ${error.message}` : "insert succeeded")
    }
    {
      const { data, error } = await asOwnerB.from("documents").update({ notes: "tampered" }).eq("id", documentA.id).select("id")
      const blocked = !!error || (data ?? []).length === 0
      record("owner B updates Company A's document", "0 rows affected / denied", blocked, error ? `error: ${error.message}` : `${(data ?? []).length} row(s) affected`)
    }

    // --- Final verification: Company A's data is provably untouched by owner B's attempts ---
    {
      const { data } = await admin.from("vehicles").select("daily_rate").eq("id", vehicleA.id).single()
      record("Company A's vehicle daily_rate is unchanged after the attack attempt", "250", data?.daily_rate === "250.00" || data?.daily_rate === 250, String(data?.daily_rate))
    }
    {
      const { data } = await admin.from("customers").select("id").eq("id", customerA.id).maybeSingle()
      record("Company A's customer still exists after the delete attempt", "still exists", !!data, data ? "exists" : "MISSING")
    }

    console.log("\n=== Summary ===")
    const failed = checks.filter((c) => !c.pass)
    console.log(`${checks.length - failed.length}/${checks.length} checks passed.`)
    if (failed.length > 0) {
      console.log("\nFAILED CHECKS:")
      for (const f of failed) console.log(` - ${f.label}: expected ${f.expected}, got ${f.actual}`)
      process.exitCode = 1
    }
  } finally {
    // -----------------------------------------------------------------
    // Teardown — always runs, even on failure, so this test leaves no
    // permanent trace on the project.
    // -----------------------------------------------------------------
    console.log("\nCleaning up test data...")
    for (const companyId of createdCompanyIds) {
      await admin.from("contracts").delete().eq("company_id", companyId)
      await admin.from("contract_template_versions").delete().eq("company_id", companyId)
      await admin.from("contract_templates").delete().eq("company_id", companyId)
      await admin.from("documents").delete().eq("company_id", companyId)
      await admin.from("payments").delete().eq("company_id", companyId)
      await admin.from("reservations").delete().eq("company_id", companyId)
      await admin.from("customers").delete().eq("company_id", companyId)
      await admin.from("vehicles").delete().eq("company_id", companyId)
      await admin.from("branches").delete().eq("company_id", companyId)
      await admin.from("company_memberships").delete().eq("company_id", companyId)
      await admin.from("companies").delete().eq("id", companyId)
    }
    for (const userId of [ownerAId, ownerBId, staffAId]) {
      await admin.auth.admin.deleteUser(userId)
    }
    console.log("Cleanup done — no test data or users remain.")
  }
}

main().catch((err) => {
  console.error("Phase 6 test run crashed:", err)
  process.exitCode = 1
})
