/**
 * Productization wave 1 phase 7 — "Verify the most sensitive real-world
 * pipeline," against the real Storage bucket and the real linked
 * Postgres project (the one phases 5/6 already proved migrations and
 * RLS against), not just the existing unit tests of `validateFile()`/
 * `validateUploadForCompany()` (which only ever run in mock mode).
 *
 * Creates two real companies (one with an owner + a Staff/manager
 * member, one with just an owner) via Supabase Auth, then — using each
 * user's own signed-in session through the **anon key** for every
 * check that matters (setup/teardown alone use the service-role key,
 * same convention as phase 6's script) — uploads a document of every
 * category the phase names, then deliberately attacks the pipeline:
 * oversized files, disallowed types, a simulated broken upload, a
 * retry, delete/archive behavior, a permission downgrade, and a
 * cross-tenant read attempt — both at the `documents` table level and
 * directly against Storage.
 *
 * No content-sniffing exists anywhere in this app (documented,
 * deliberate — see docs/security.md's "Document security" section), so
 * the uploaded bytes here are plain dummy buffers with a declared
 * content-type; every check below is about the pipeline's access
 * control and reliability, not image/PDF validity.
 *
 * Cleans up every company, membership, document row, and Storage
 * object it creates in a `finally` block, plus the two auth.users rows,
 * regardless of outcome.
 *
 * Run: npx tsx scripts/phase7-document-pipeline.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { validateFile, MAX_FILE_SIZE_BYTES, ACCEPTED_DOCUMENT_MIME_TYPES } from "../lib/storage"

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

const BUCKET = "company-files"
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const RUN_ID = randomUUID().slice(0, 8)
const PASSWORD = `Phase7-${randomUUID()}`

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

function dummyBuffer(sizeBytes: number): Buffer {
  return Buffer.alloc(sizeBytes, 1)
}

const storagePathsToCleanUp: string[] = []
function trackedPath(companyId: string, segment: string, filename: string): string {
  const path = `${companyId}/${segment}/${RUN_ID}-${filename}`
  storagePathsToCleanUp.push(path)
  return path
}

async function main() {
  console.log(`\n=== Phase 7 document pipeline test run ${RUN_ID} ===\n`)

  const ownerEmail = `phase7-owner-a-${RUN_ID}@example.com`
  const staffEmail = `phase7-staff-a-${RUN_ID}@example.com`
  const ownerBEmail = `phase7-owner-b-${RUN_ID}@example.com`

  const { data: ownerUser, error: e1 } = await admin.auth.admin.createUser({ email: ownerEmail, password: PASSWORD, email_confirm: true })
  if (e1 || !ownerUser.user) throw new Error(`createUser owner failed: ${e1?.message}`)
  const { data: staffUser, error: e2 } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true })
  if (e2 || !staffUser.user) throw new Error(`createUser staff failed: ${e2?.message}`)
  const { data: ownerBUser, error: e3 } = await admin.auth.admin.createUser({ email: ownerBEmail, password: PASSWORD, email_confirm: true })
  if (e3 || !ownerBUser.user) throw new Error(`createUser ownerB failed: ${e3?.message}`)
  console.log(`Created 3 test users: ownerA=${ownerUser.user.id} staffA=${staffUser.user.id} ownerB=${ownerBUser.user.id}`)

  const createdCompanyIds: string[] = []

  try {
    const { data: companyA, error: caErr } = await admin
      .from("companies")
      .insert({ name: `Phase7 Co A ${RUN_ID}`, slug: `phase7-co-a-${RUN_ID}`, currency: "MAD", default_language: "fr", status: "active" })
      .select()
      .single()
    if (caErr || !companyA) throw new Error(`companyA failed: ${caErr?.message}`)
    const { data: companyB, error: cbErr } = await admin
      .from("companies")
      .insert({ name: `Phase7 Co B ${RUN_ID}`, slug: `phase7-co-b-${RUN_ID}`, currency: "MAD", default_language: "fr", status: "active" })
      .select()
      .single()
    if (cbErr || !companyB) throw new Error(`companyB failed: ${cbErr?.message}`)
    createdCompanyIds.push(companyA.id, companyB.id)
    console.log(`Created companies: A=${companyA.id} B=${companyB.id}`)

    const { error: memErr } = await admin.from("company_memberships").insert([
      { company_id: companyA.id, user_id: ownerUser.user.id, role: "owner", status: "active" },
      { company_id: companyA.id, user_id: staffUser.user.id, role: "manager", status: "active" },
      { company_id: companyB.id, user_id: ownerBUser.user.id, role: "owner", status: "active" },
    ])
    if (memErr) throw new Error(`memberships failed: ${memErr.message}`)

    const { data: customerA, error: cuErr } = await admin
      .from("customers")
      .insert({ company_id: companyA.id, full_name: "Phase7 Test Customer", phone: "+212600000002" })
      .select()
      .single()
    if (cuErr || !customerA) throw new Error(`customerA failed: ${cuErr?.message}`)

    const { data: vehicleA, error: vErr } = await admin
      .from("vehicles")
      .insert({ company_id: companyA.id, registration_number: `P7-${RUN_ID}`, make: "Dacia", model: "Duster", year: 2023, category: "suv", daily_rate: 350 })
      .select()
      .single()
    if (vErr || !vehicleA) throw new Error(`vehicleA failed: ${vErr?.message}`)

    const pickup = new Date()
    const ret = new Date(pickup.getTime() + 3 * 24 * 60 * 60 * 1000)
    const { data: reservationA, error: rErr } = await admin
      .from("reservations")
      .insert({
        company_id: companyA.id,
        customer_id: customerA.id,
        vehicle_id: vehicleA.id,
        reference: `P7-${RUN_ID}`,
        pickup_at: pickup.toISOString(),
        return_at: ret.toISOString(),
        status: "confirmed",
        daily_rate: 350,
        num_days: 3,
        total_amount: 1050,
      })
      .select()
      .single()
    if (rErr || !reservationA) throw new Error(`reservationA failed: ${rErr?.message}`)

    console.log("Seeded Company A: customer, vehicle, reservation. Company B: owner only.\n")

    const asOwnerA = await signedInClient(ownerEmail, PASSWORD)
    const asStaffA = await signedInClient(staffEmail, PASSWORD)
    const asOwnerB = await signedInClient(ownerBEmail, PASSWORD)

    async function uploadAndRecord(
      client: SupabaseClient,
      filename: string,
      bytes: Buffer,
      contentType: string,
      category: string,
      linkField: "customer_id" | "vehicle_id" | "reservation_id",
      linkId: string
    ) {
      // Matches the real app's path convention exactly (new-document-form.tsx/
      // document-upload-row.tsx build `{companyId}/documents/{linkId}/...`) —
      // this specific shape is what the storage-RLS permission-gate fix
      // (checkpoint 3) keys off, so the test has to use it for real.
      const path = trackedPath(companyA.id, `documents/${linkId}`, filename)
      const { error: upErr } = await client.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
      if (upErr) return { path, docId: null as string | null, uploadError: upErr.message }
      const { data: doc, error: docErr } = await client
        .from("documents")
        .insert({
          company_id: companyA.id,
          category,
          storage_path: path,
          original_filename: filename,
          mime_type: contentType,
          file_size_bytes: bytes.length,
          [linkField]: linkId,
        })
        .select("id")
        .single()
      return { path, docId: doc?.id ?? null, uploadError: null, docError: docErr?.message }
    }

    // --- 1-5: one real upload per named document type ---
    const cin = await uploadAndRecord(asOwnerA, "cin.jpg", dummyBuffer(50_000), "image/jpeg", "identity_document", "customer_id", customerA.id)
    record("upload CIN (identity_document)", "object + row created", !!cin.docId, cin.docId ? "created" : `upload:${cin.uploadError} doc:${cin.docError}`)

    const passport = await uploadAndRecord(asOwnerA, "passport.jpg", dummyBuffer(60_000), "image/jpeg", "identity_document", "customer_id", customerA.id)
    record("upload Passport (identity_document, same category)", "object + row created", !!passport.docId, passport.docId ? "created" : `upload:${passport.uploadError} doc:${passport.docError}`)

    const licence = await uploadAndRecord(asOwnerA, "licence.jpg", dummyBuffer(45_000), "image/jpeg", "driving_licence", "customer_id", customerA.id)
    record("upload driving licence", "object + row created", !!licence.docId, licence.docId ? "created" : `upload:${licence.uploadError} doc:${licence.docError}`)

    const vehicleDoc = await uploadAndRecord(asOwnerA, "carte-grise.pdf", dummyBuffer(80_000), "application/pdf", "vehicle_registration", "vehicle_id", vehicleA.id)
    record("upload vehicle document", "object + row created", !!vehicleDoc.docId, vehicleDoc.docId ? "created" : `upload:${vehicleDoc.uploadError} doc:${vehicleDoc.docError}`)

    const contractFile = await uploadAndRecord(asOwnerA, "contract.pdf", dummyBuffer(100_000), "application/pdf", "rental_contract", "reservation_id", reservationA.id)
    record("upload contract file", "object + row created", !!contractFile.docId, contractFile.docId ? "created" : `upload:${contractFile.uploadError} doc:${contractFile.docError}`)

    // --- 6: large image ---
    {
      const big = { type: "image/jpeg", size: MAX_FILE_SIZE_BYTES + 1 }
      const appError = validateFile(big, ACCEPTED_DOCUMENT_MIME_TYPES)
      record("app-level validateFile rejects a >15MB file", "rejected", !!appError, appError ?? "accepted")

      const bigPath = trackedPath(companyA.id, "identity_document", "oversized.jpg")
      const { error: bigUpErr } = await asOwnerA.storage.from(BUCKET).upload(bigPath, dummyBuffer(MAX_FILE_SIZE_BYTES + 1024), { contentType: "image/jpeg" })
      record(
        "direct-to-Storage upload of a >15MB file (bypassing app JS)",
        "rejected by Storage itself",
        !!bigUpErr,
        bigUpErr ? `rejected: ${bigUpErr.message}` : "SUCCEEDED — no server-side size limit configured on the bucket"
      )
    }

    // --- 7: wrong file type ---
    {
      const appError = validateFile({ type: "application/zip", size: 1000 }, ACCEPTED_DOCUMENT_MIME_TYPES)
      record("app-level validateFile rejects a disallowed mime type", "rejected", !!appError, appError ?? "accepted")

      const badPath = trackedPath(companyA.id, "identity_document", "not-a-document.zip")
      const { error: badUpErr } = await asOwnerA.storage.from(BUCKET).upload(badPath, dummyBuffer(1000), { contentType: "application/zip" })
      record(
        "direct-to-Storage upload of a disallowed mime type (bypassing app JS)",
        "rejected by Storage itself",
        !!badUpErr,
        badUpErr ? `rejected: ${badUpErr.message}` : "SUCCEEDED — no server-side mime allowlist configured on the bucket"
      )
    }

    // --- 8: broken upload (simulated crash between Storage upload and createDocumentRecord) ---
    let orphanPath = ""
    {
      orphanPath = trackedPath(companyA.id, "identity_document", "orphaned.jpg")
      const { error: upErr } = await asOwnerA.storage.from(BUCKET).upload(orphanPath, dummyBuffer(20_000), { contentType: "image/jpeg" })
      // Deliberately never call createDocumentRecord — simulating the client
      // crashing/losing connectivity between the two steps.
      const { data: listing } = await admin.storage.from(BUCKET).list(`${companyA.id}/identity_document`)
      const orphanExists = (listing ?? []).some((f) => orphanPath.endsWith(f.name))
      record(
        "broken upload leaves an orphaned Storage object with no documents row",
        "object exists in Storage, no DB row",
        !upErr && orphanExists,
        upErr ? `upload failed: ${upErr.message}` : orphanExists ? "confirmed orphaned" : "object missing"
      )
    }

    // --- 9: retry after a deliberate failure ---
    {
      const badBucketClient = asOwnerA.storage.from("this-bucket-does-not-exist")
      const retryPath = trackedPath(companyA.id, "identity_document", "retry.jpg")
      const { error: firstErr } = await badBucketClient.upload(retryPath, dummyBuffer(20_000), { contentType: "image/jpeg" })
      const { error: secondErr } = await asOwnerA.storage.from(BUCKET).upload(retryPath, dummyBuffer(20_000), { contentType: "image/jpeg" })
      record(
        "retrying with the correct bucket after a failed attempt succeeds cleanly",
        "first attempt fails, retry succeeds",
        !!firstErr && !secondErr,
        `first: ${firstErr ? "failed" : "succeeded"}, retry: ${secondErr ? `failed (${secondErr.message})` : "succeeded"}`
      )
    }

    // --- 10: delete / archive ---
    {
      // Two uploads of the same category to the same customer — the second
      // should supersede the first. Uses proof_of_address specifically
      // because it's the one category none of checks 1-5 already touched
      // for this customer — driving_licence, identity_document etc already
      // have an active row for customerA by this point, which would make
      // the "exactly one active row" query below ambiguous.
      const v1Path = trackedPath(companyA.id, "proof_of_address", "address-v1.jpg")
      await asOwnerA.storage.from(BUCKET).upload(v1Path, dummyBuffer(30_000), { contentType: "image/jpeg" })
      const { data: v1Doc } = await asOwnerA
        .from("documents")
        .insert({ company_id: companyA.id, category: "proof_of_address", storage_path: v1Path, original_filename: "address-v1.jpg", mime_type: "image/jpeg", file_size_bytes: 30_000, customer_id: customerA.id })
        .select("id")
        .single()

      const v2Path = trackedPath(companyA.id, "proof_of_address", "address-v2.jpg")
      await asOwnerA.storage.from(BUCKET).upload(v2Path, dummyBuffer(30_000), { contentType: "image/jpeg" })
      // createDocumentRecord/findSupersededDocument both live in Next.js-only
      // modules (request-scoped cookies via next/headers) that assume a real
      // request context this standalone script doesn't have — so the exact
      // same lookup findSupersededDocument runs (lib/documents.ts) is inlined
      // here directly instead of importing those modules.
      const { data: supersededRow } = await asOwnerA
        .from("documents")
        .select("id")
        .eq("company_id", companyA.id)
        .eq("category", "proof_of_address")
        .eq("status", "active")
        .eq("customer_id", customerA.id)
        .maybeSingle()
      const supersededId = supersededRow?.id ?? null
      const { data: v2Doc } = await asOwnerA
        .from("documents")
        .insert({ company_id: companyA.id, category: "proof_of_address", storage_path: v2Path, original_filename: "address-v2.jpg", mime_type: "image/jpeg", file_size_bytes: 30_000, customer_id: customerA.id, replaces_document_id: supersededId })
        .select("id")
        .single()
      if (supersededId) {
        await asOwnerA.from("documents").update({ status: "replaced" }).eq("id", supersededId).eq("company_id", companyA.id)
      }
      record("uploading a new driving licence supersedes the previous one", "previous id found and flippable", supersededId === v1Doc?.id, `superseded=${supersededId}, v1=${v1Doc?.id}`)

      const { data: v1After } = await admin.from("documents").select("status").eq("id", v1Doc?.id).single()
      record("superseded document flips to status='replaced', not deleted", "replaced", v1After?.status === "replaced", String(v1After?.status))

      // Delete the v2 document — DB row should survive as 'deleted', Storage object should actually be gone.
      await asOwnerA.from("documents").update({ status: "deleted" }).eq("id", v2Doc?.id).eq("company_id", companyA.id)
      await asOwnerA.storage.from(BUCKET).remove([v2Path])

      const { data: v2After } = await admin.from("documents").select("status").eq("id", v2Doc?.id).single()
      record("deleted document's DB row survives with status='deleted'", "deleted", v2After?.status === "deleted", String(v2After?.status))

      const { data: signedAfterDelete, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(v2Path, 60)
      record(
        "deleted document's Storage object is actually gone",
        "signed URL creation fails / object missing",
        !!signErr || !signedAfterDelete?.signedUrl,
        signErr ? `denied: ${signErr.message}` : "signed URL still generated — object was NOT removed"
      )
    }

    // --- 11: permission-gated access ---
    {
      const { data: staffCanSeeBefore } = await asStaffA.from("documents").select("id").eq("id", cin.docId)
      record("staff (before switch flip) can see Company A's document row", "1 row", (staffCanSeeBefore ?? []).length === 1, `${(staffCanSeeBefore ?? []).length} row(s)`)

      const { error: rpcErr } = await asOwnerA.rpc("grant_permission_override", {
        p_company_id: companyA.id,
        p_user_id: staffUser.user.id,
        p_permission_key: "download_documents",
        p_allowed: false,
        p_reason: "Phase 7 permission-gated access test",
      })
      if (rpcErr) throw new Error(`grant_permission_override failed: ${rpcErr.message}`)

      const { data: staffCanSeeAfter } = await asStaffA.from("documents").select("id").eq("id", cin.docId)
      record("staff (download_documents OFF) can no longer see the document row", "0 rows", (staffCanSeeAfter ?? []).length === 0, `${(staffCanSeeAfter ?? []).length} row(s)`)

      const { data: staffSignedUrl, error: staffSignErr } = await asStaffA.storage.from(BUCKET).createSignedUrl(cin.path, 60)
      record(
        "staff (download_documents OFF) attempting a direct Storage signed URL for the known path",
        "denied (storage RLS should also respect the permission)",
        !!staffSignErr || !staffSignedUrl?.signedUrl,
        staffSignErr ? `denied: ${staffSignErr.message}` : "SUCCEEDED — storage RLS only checks company membership, not download_documents"
      )
    }

    // --- 12: cross-tenant leak ---
    {
      const { data: crossRead } = await asOwnerB.from("documents").select("id").eq("id", cin.docId)
      record("owner B reads Company A's document row", "0 rows (denied by RLS)", (crossRead ?? []).length === 0, `${(crossRead ?? []).length} row(s)`)

      const { data: crossSignedUrl, error: crossSignErr } = await asOwnerB.storage.from(BUCKET).createSignedUrl(cin.path, 60)
      record(
        "owner B (non-member) attempts a direct Storage signed URL for Company A's known path",
        "denied",
        !!crossSignErr || !crossSignedUrl?.signedUrl,
        crossSignErr ? `denied: ${crossSignErr.message}` : "SUCCEEDED — cross-tenant Storage leak"
      )
    }

    console.log("\n=== Summary ===")
    const failed = checks.filter((c) => !c.pass)
    console.log(`${checks.length - failed.length}/${checks.length} checks passed.`)
    if (failed.length > 0) {
      console.log("\nFAILED / FLAGGED CHECKS:")
      for (const f of failed) console.log(` - ${f.label}: expected ${f.expected}, got ${f.actual}`)
      process.exitCode = 1
    }
  } finally {
    console.log("\nCleaning up test data...")
    for (const path of storagePathsToCleanUp) {
      await admin.storage.from(BUCKET).remove([path]).catch(() => {})
    }
    for (const companyId of createdCompanyIds) {
      await admin.from("documents").delete().eq("company_id", companyId)
      await admin.from("reservations").delete().eq("company_id", companyId)
      await admin.from("customers").delete().eq("company_id", companyId)
      await admin.from("vehicles").delete().eq("company_id", companyId)
      await admin.from("company_memberships").delete().eq("company_id", companyId)
      await admin.from("companies").delete().eq("id", companyId)
    }
    for (const user of [ownerUser.user, staffUser.user, ownerBUser.user]) {
      await admin.auth.admin.deleteUser(user.id)
    }
    console.log("Cleanup done — no test data, users, or Storage objects remain.")
  }
}

main().catch((err) => {
  console.error("Phase 7 test run crashed:", err)
  process.exitCode = 1
})
