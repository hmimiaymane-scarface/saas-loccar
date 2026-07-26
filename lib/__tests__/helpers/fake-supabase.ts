/**
 * A general-purpose in-memory fake Supabase client, generalized from the
 * single-file pattern `lib/contracts/__tests__/template-store.test.ts`
 * pioneered (`makeFakeSupabase()` there is intentionally narrow — "not a
 * general-purpose Supabase mock"). This one exists specifically for
 * roadmap phase 19's cross-tenant isolation suite, which needs the same
 * chain shapes across many *different* tables/modules rather than one
 * store's specific call pattern — a shared, reusable harness earns its
 * keep here in a way it wouldn't for a single feature's tests.
 *
 * Supports the query chain shapes actually used by the store functions
 * this suite calls: `eq`/`in`/`order`/`limit`/`maybeSingle`/`single`/
 * plain array resolution. Does not simulate FK embeds, storage, or RPCs
 * — add to it only if a real test needs the shape, per the same
 * narrow-on-purpose philosophy as the file it's generalized from.
 */
export function makeFakeSupabase(seed: Record<string, Record<string, unknown>[]> = {}) {
  const tables: Record<string, Record<string, unknown>[]> = { ...seed }
  let nextId = 1

  function matchesFilters(row: Record<string, unknown>, filters: [string, unknown][]) {
    return filters.every(([key, value]) => (Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
  }

  function queryBuilder(table: string) {
    if (!tables[table]) tables[table] = []
    const filters: [string, unknown][] = []
    let orderKey: string | null = null
    let orderAsc = true
    let limitCount: number | null = null

    function rows() {
      let result = tables[table].filter((r) => matchesFilters(r, filters))
      if (orderKey) {
        const key = orderKey
        result = [...result].sort((a, b) =>
          (a[key] as number | string) < (b[key] as number | string) ? (orderAsc ? -1 : 1) : orderAsc ? 1 : -1
        )
      }
      if (limitCount != null) result = result.slice(0, limitCount)
      return result
    }

    const builder = {
      eq(key: string, value: unknown) {
        filters.push([key, value])
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
        const id = row.id ?? `${table}_${nextId++}`
        const inserted = { id, ...row }
        tables[table].push(inserted)
        return {
          select() {
            return { single: () => Promise.resolve({ data: inserted, error: null }) }
          },
        }
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
  }

  return { client: client as never, tables }
}
