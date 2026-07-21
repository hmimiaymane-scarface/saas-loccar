import { describe, expect, it, vi, beforeEach } from "vitest"

const aiMock = vi.hoisted(() => ({ proposeContractTemplateMapping: vi.fn() }))
vi.mock("@/lib/contracts/template-ai", () => aiMock)

const pdfExtractMock = vi.hoisted(() => ({ extractPdfText: vi.fn() }))
vi.mock("@/lib/contracts/pdf-extract", () => pdfExtractMock)

const pdfRenderMock = vi.hoisted(() => ({ renderContractPdf: vi.fn() }))
vi.mock("@/lib/contracts/pdf-render", () => pdfRenderMock)

const activityLogMock = vi.hoisted(() => ({ recordEvent: vi.fn(async () => {}) }))
vi.mock("@/lib/activity-log", () => activityLogMock)

import {
  proposeTemplateFromUpload,
  activateVersion,
  createEditedVersion,
  generateContract,
  getTemplateVersion,
} from "@/lib/contracts/template-store"
import type { SessionContext } from "@/lib/auth/session"

function makeSession(role: SessionContext["role"] = "manager"): SessionContext {
  return {
    userId: "user-1",
    email: "manager@atlas.test",
    profile: { fullName: "Manager Person", avatarPath: null, phone: null, preferredLanguage: "en" },
    company: {
      id: "co_1",
      name: "Atlas Rent Car",
      slug: "atlas",
      city: "Marrakech",
      country: "Morocco",
      currency: "MAD",
      timezone: "Africa/Casablanca",
      status: "active",
      maintenanceReminderDays: 14,
      documentExpiryWarningDays: 30,
      agentsCanRecordExpenses: false,
      mutedNotificationTypes: [],
    },
    role,
  }
}

/**
 * A small, real (not canned-response) in-memory fake — needed because
 * these store functions issue several *different* sequential
 * operations against the *same* table within one call (activateVersion
 * selects, then updates, then updates again), so a single canned
 * per-table response (the pattern other store tests use) can't tell
 * "the old version got archived" from "the new one got activated."
 * Supports exactly the chain shapes lib/contracts/template-store.ts
 * actually calls — not a general-purpose Supabase mock.
 */
function makeFakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    contract_templates: [],
    contract_template_versions: [],
    contracts: [],
    contract_signatures: [],
    contract_amendments: [],
    reservations: [],
    deposits: [],
    documents: [],
    companies: [],
  }
  let nextId = 1
  let nextContractNumber = 1000
  const storageUploads: { path: string; bytes: unknown }[] = []

  function matchesFilters(row: Record<string, unknown>, filters: [string, unknown][]) {
    return filters.every(([key, value]) => (Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
  }

  function queryBuilder(table: string) {
    if (!tables[table]) tables[table] = []
    const filters: [string, unknown][] = []
    let orderKey: string | null = null
    let orderAsc = true
    let limitCount: number | null = null
    let ilikeFilter: [string, string] | null = null

    function rows() {
      let result = tables[table].filter((r) => matchesFilters(r, filters))
      if (ilikeFilter) {
        const [key, needle] = ilikeFilter
        result = result.filter((r) => String(r[key] ?? "").toLowerCase().includes(needle.toLowerCase()))
      }
      if (orderKey) {
        const key = orderKey
        result = [...result].sort((a, b) => (a[key] as number | string) < (b[key] as number | string) ? (orderAsc ? -1 : 1) : orderAsc ? 1 : -1)
      }
      if (limitCount != null) result = result.slice(0, limitCount)
      return result
    }

    const builder = {
      eq(key: string, value: unknown) {
        filters.push([key, value])
        return builder
      },
      not() {
        return builder
      },
      ilike(key: string, pattern: string) {
        ilikeFilter = [key, pattern.replace(/%/g, "")]
        return builder
      },
      in(key: string, values: unknown[]) {
        filters.push([key, values])
        return builder
      },
      order(key: string, opts?: { ascending?: boolean }) {
        orderKey = key
        orderAsc = opts?.ascending ?? true
        return builder
      },
      limit(n: number) {
        limitCount = n
        return builder
      },
      select() {
        return builder
      },
      maybeSingle() {
        return Promise.resolve({ data: rows()[0] ?? null, error: null })
      },
      single() {
        const row = rows()[0]
        return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "not found" } })
      },
      insert(row: Record<string, unknown>) {
        const id = `${table}_${nextId++}`
        const inserted = { id, ...row }
        tables[table].push(inserted)
        return {
          select() {
            return { single: () => Promise.resolve({ data: inserted, error: null }) }
          },
        }
      },
      update(patch: Record<string, unknown>) {
        const updateBuilder = {
          _filters: [] as [string, unknown][],
          eq(key: string, value: unknown) {
            this._filters.push([key, value])
            return this
          },
          then(resolve: (v: { data: null; error: null }) => void) {
            for (const row of tables[table]) {
              if (matchesFilters(row, [...filters, ...this._filters])) Object.assign(row, patch)
            }
            resolve({ data: null, error: null })
          },
        }
        return updateBuilder
      },
      then(resolve: (v: { data: unknown[]; error: null; count: number }) => void) {
        const result = rows()
        resolve({ data: result, error: null, count: result.length })
      },
    }
    return builder
  }

  const client = {
    from: (table: string) => queryBuilder(table),
    rpc: (fn: string) => {
      if (fn === "next_contract_reference") {
        return Promise.resolve({ data: `CT-${nextContractNumber++}`, error: null })
      }
      return Promise.resolve({ data: null, error: { message: `Unmocked rpc: ${fn}` } })
    },
    storage: {
      from: () => ({
        download: () => Promise.resolve({ data: new Blob(["fake pdf bytes"]), error: null }),
        upload: (path: string, bytes: unknown) => {
          storageUploads.push({ path, bytes })
          return Promise.resolve({ error: null })
        },
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://example.test/signed" }, error: null }),
      }),
    },
  }

  return { client: client as never, tables, storageUploads }
}

beforeEach(() => {
  aiMock.proposeContractTemplateMapping.mockReset()
  pdfExtractMock.extractPdfText.mockReset()
  pdfExtractMock.extractPdfText.mockResolvedValue({ ok: true, text: "Renter: [CUSTOMER NAME]" })
  pdfRenderMock.renderContractPdf.mockReset()
  pdfRenderMock.renderContractPdf.mockResolvedValue(new Uint8Array([1, 2, 3]))
  activityLogMock.recordEvent.mockClear()
})

describe("proposeTemplateFromUpload", () => {
  it("creates a template and a pending_review first version, dropping unknown field paths", async () => {
    aiMock.proposeContractTemplateMapping.mockResolvedValue({
      ok: true,
      data: {
        sections: [{ title: "Renter", bodyText: "{{customer.fullName}}", looksConditional: false }],
        variableMappings: [
          { placeholder: "[CUSTOMER NAME]", fieldPath: "customer.fullName", label: "Customer name" },
          { placeholder: "[MADE UP]", fieldPath: "not.a.real.field", label: "Bogus" },
        ],
        notes: "Looks straightforward.",
      },
      confidence: "high",
      modelId: "claude-sonnet-5",
    })

    const { client, tables } = makeFakeSupabase()
    const result = await proposeTemplateFromUpload(client, makeSession(), {
      name: "Standard agreement",
      language: "fr",
      storagePath: "co_1/contract-templates/abc-file.pdf",
    })

    expect(result.ok).toBe(true)
    expect(tables.contract_templates).toHaveLength(1)
    expect(tables.contract_template_versions).toHaveLength(1)
    const version = tables.contract_template_versions[0]
    expect(version.status).toBe("pending_review")
    expect(version.version_number).toBe(1)
    expect((version.variable_mappings as unknown[]).length).toBe(1) // the bogus field path was dropped
  })

  it("rejects a storage path outside the caller's own company", async () => {
    const { client } = makeFakeSupabase()
    const result = await proposeTemplateFromUpload(client, makeSession(), {
      name: "X",
      language: "fr",
      storagePath: "some_other_company/contract-templates/abc.pdf",
    })
    expect(result.ok).toBe(false)
  })
})

describe("activateVersion and createEditedVersion (acceptance criterion: editing never destroys the old version)", () => {
  it("archives the previous active version and points the template at the new one, leaving the old version's content untouched", async () => {
    const { client, tables } = makeFakeSupabase()
    const session = makeSession()

    tables.contract_templates.push({ id: "tpl_1", company_id: "co_1", name: "Standard", language: "fr", active_version_id: null })
    tables.contract_template_versions.push({
      id: "v1",
      template_id: "tpl_1",
      company_id: "co_1",
      version_number: 1,
      status: "pending_review",
      sections: [{ id: "s1", title: "Renter", bodyText: "{{customer.fullName}}", condition: null }],
      variable_mappings: [],
      legal_footer_text: null,
      ai_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: "2026-01-01T00:00:00Z",
    })

    const activated = await activateVersion(client, session, "v1")
    expect(activated.ok).toBe(true)
    expect(tables.contract_templates[0].active_version_id).toBe("v1")
    expect(tables.contract_template_versions[0].status).toBe("active")

    // Now edit — must create a NEW version, not mutate v1.
    const edited = await createEditedVersion(client, session, {
      templateId: "tpl_1",
      sections: [{ id: "s1", title: "Renter (edited)", bodyText: "{{customer.fullName}} agrees.", condition: null }],
      variableMappings: [],
      legalFooterText: "Standard terms apply.",
    })
    expect(edited.ok).toBe(true)
    if (!edited.ok) return

    expect(tables.contract_template_versions).toHaveLength(2)
    const v1After = tables.contract_template_versions.find((v) => v.id === "v1")!
    // The original version's own content is byte-for-byte unchanged.
    expect((v1After.sections as { title: string }[])[0].title).toBe("Renter")
    expect(v1After.status).toBe("active") // still active until the new one is explicitly activated

    const v2 = await getTemplateVersion(client, "co_1", edited.versionId)
    expect(v2?.versionNumber).toBe(2)
    expect(v2?.status).toBe("pending_review")
    expect(v2?.sections[0].title).toBe("Renter (edited)")

    // Activating v2 archives v1 — a contract already generated from v1
    // still points at v1's row, which still exists with its original content.
    const activated2 = await activateVersion(client, session, edited.versionId)
    expect(activated2.ok).toBe(true)
    expect(tables.contract_templates[0].active_version_id).toBe(edited.versionId)
    expect(tables.contract_template_versions.find((v) => v.id === "v1")!.status).toBe("archived")
    expect((tables.contract_template_versions.find((v) => v.id === "v1")!.sections as { title: string }[])[0].title).toBe("Renter")
  })
})

describe("generateContract", () => {
  it("resolves real data and includes/excludes sections by their condition", async () => {
    const { client, tables } = makeFakeSupabase()
    const session = makeSession()

    tables.contract_templates.push({ id: "tpl_1", company_id: "co_1", name: "Standard", language: "fr", active_version_id: "v1" })
    tables.contract_template_versions.push({
      id: "v1",
      template_id: "tpl_1",
      company_id: "co_1",
      version_number: 1,
      status: "active",
      sections: [
        { id: "s1", title: "Renter", bodyText: "Renter: {{customer.fullName}}", condition: null },
        {
          id: "s2",
          title: "Deposit clause",
          bodyText: "A deposit of {{deposit.collectedAmountMad}} was collected.",
          condition: { fieldPath: "flags.depositCollected", operator: "equals", value: "true" },
        },
        {
          id: "s3",
          title: "Young driver surcharge",
          bodyText: "A young-driver surcharge applies.",
          condition: { fieldPath: "flags.youngDriver", operator: "equals", value: "true" },
        },
      ],
      variable_mappings: [],
      legal_footer_text: "Governed by local law.",
      created_at: "2026-01-01T00:00:00Z",
    })
    tables.reservations.push({
      id: "res_1",
      company_id: "co_1",
      reference: "RB-3391",
      pickup_at: "2026-07-15T10:00:00Z",
      return_at: "2026-07-19T10:00:00Z",
      pickup_location: "Airport",
      return_location: "Airport",
      daily_rate: 380,
      discount_amount: 0,
      total_amount: 1520,
      customer: {
        id: "cus_1",
        full_name: "Ahmed Tazi",
        phone: "+212 662-897431",
        email: null,
        address: null,
        nationality: null,
        license_number: "MA-1",
        license_expires_on: "2028-01-01",
        id_document_number: null,
        date_of_birth: "1990-01-01",
      },
      vehicle: {
        id: "veh_1",
        make: "Hyundai",
        model: "Accent",
        year: 2023,
        registration_number: "12345-A-6",
        color: null,
        category: "compact",
        seats: 5,
        fuel_type: "petrol",
        transmission: "manual",
      },
    })
    tables.deposits.push({ company_id: "co_1", reservation_id: "res_1", expected_amount: 3000, collected_amount: 3000 })
    tables.companies.push({ id: "co_1", name: "Atlas Rent Car", address: "45 Av. Mohammed V", city: "Marrakech", country: "Morocco", tax_id: "123", business_register: "RC-1" })
    tables.documents.push({ company_id: "co_1", customer_id: "cus_1", status: "active", category: "identity_document", expires_on: "2029-01-01" })

    const result = await generateContract(client, session, { reservationId: "res_1" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const contract = tables.contracts.find((c) => c.id === result.contractId)!
    expect(contract.status).toBe("draft")
    expect(contract.contract_number).toMatch(/^CT-\d+$/)
    const context = contract.resolved_context as Record<string, string>
    expect(context["customer.fullName"]).toBe("Ahmed Tazi")
    expect(context["vehicle.plate"]).toBe("12345-A-6")
    expect(context["company.name"]).toBe("Atlas Rent Car")

    const rendered = contract.rendered_sections as { title: string; body: string }[]
    const titles = rendered.map((s) => s.title)
    expect(titles).toContain("Renter")
    expect(titles).toContain("Deposit clause") // flags.depositCollected is true
    expect(titles).not.toContain("Young driver surcharge") // Ahmed Tazi (born 1990) is not a young driver
    expect(rendered.find((s) => s.title === "Deposit clause")!.body).toBe("A deposit of 3,000 MAD was collected.")

    expect(activityLogMock.recordEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ type: "contract_generated", entityType: "contract" })
    )
  })

  it("blocks generation with a specific error when the customer has no identity document on file", async () => {
    const { client, tables } = makeFakeSupabase()
    tables.contract_templates.push({ id: "tpl_1", company_id: "co_1", name: "Standard", language: "fr", active_version_id: "v1" })
    tables.contract_template_versions.push({
      id: "v1",
      template_id: "tpl_1",
      company_id: "co_1",
      version_number: 1,
      status: "active",
      sections: [{ id: "s1", title: "Renter", bodyText: "{{customer.fullName}}", condition: null }],
      variable_mappings: [],
      legal_footer_text: null,
      created_at: "2026-01-01T00:00:00Z",
    })
    tables.reservations.push({
      id: "res_1",
      company_id: "co_1",
      reference: "RB-3391",
      pickup_at: "2026-07-15T10:00:00Z",
      return_at: "2026-07-19T10:00:00Z",
      pickup_location: "Airport",
      return_location: "Airport",
      daily_rate: 380,
      discount_amount: 0,
      total_amount: 1520,
      customer: {
        id: "cus_1",
        full_name: "Ahmed Tazi",
        phone: "+212 662-897431",
        email: null,
        address: null,
        nationality: null,
        license_number: "MA-1",
        license_expires_on: "2028-01-01",
        id_document_number: null,
        date_of_birth: "1990-01-01",
      },
      vehicle: null,
    })
    tables.companies.push({ id: "co_1", name: "Atlas Rent Car", address: null, city: null, country: "Morocco", tax_id: null, business_register: null })
    // No identity document, and no vehicle assigned — both should surface.

    const result = await generateContract(client, makeSession(), { reservationId: "res_1" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("no identity document on file")
    expect(result.error).toContain("no vehicle assigned")
    expect(tables.contracts).toHaveLength(0) // nothing was persisted, not even a draft
  })
})
