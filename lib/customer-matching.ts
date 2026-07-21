/**
 * Duplicate-customer detection (roadmap phase 04 requirement 5,
 * extended by phase 08 requirement 3 into a full customer-record-level
 * concept — name, birth date, licence/passport number, phone, email).
 * Pure scoring logic only — no Supabase dependency, so it's
 * unit-testable without mocking a database and reusable from both the
 * mock-data and live-data branches of lib/data.ts#findDuplicateCandidates.
 *
 * The bible's flow is Merge / Keep Separate / Review Later, not a hard
 * block — see how app/(dashboard)/customers/actions.ts#createCustomer
 * and #updateCustomerProfile use this: a likely duplicate returns
 * candidates for the form to show rather than refusing to save.
 *
 * False-positive risk was a named acceptance requirement for phase 08
 * (e.g. "same phone reused legitimately" — a shared household/business
 * line between genuinely different people). Phone and email are real
 * signals but weighted below identity-document/licence numbers (which
 * are, practically, unique to one person) for exactly that reason — see
 * scoreCustomerMatch's weights and lib/__tests__/customer-matching.test.ts's
 * false-positive cases.
 */

export interface CustomerMatchCandidate {
  fullName: string
  idDocumentNumber?: string | null
  licenseNumber?: string | null
  phone?: string | null
  email?: string | null
  /** ISO date (YYYY-MM-DD). A supporting signal only — many unrelated
   * people share a birth date, so this alone never surfaces a match
   * (see DUPLICATE_SURFACE_THRESHOLD and its weight below). */
  dateOfBirth?: string | null
}

export interface ExistingCustomerRecord {
  id: string
  fullName: string
  idDocumentNumber?: string | null
  licenseNumber?: string | null
  phone?: string | null
  email?: string | null
  dateOfBirth?: string | null
}

export interface DuplicateMatch {
  customerId: string
  fullName: string
  confidence: number
  matchedFields: string[]
  /** Confidence crossed DUPLICATE_LIKELY_THRESHOLD — strong enough to
   * warn prominently, as opposed to merely being included for review. */
  isLikelyDuplicate: boolean
}

/** Below this, a candidate isn't surfaced at all — e.g. two customers who
 * happen to share a common first name with nothing else in common. */
export const DUPLICATE_SURFACE_THRESHOLD = 40
/** At or above this, treat it as a strong signal worth a prominent
 * warning rather than a quiet "maybe review this later" entry. */
export const DUPLICATE_LIKELY_THRESHOLD = 70

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp = Array.from({ length: m + 1 }, (_, i) => i)
  for (let j = 1; j <= n; j++) {
    let prevDiagonal = dp[0]
    dp[0] = j
    for (let i = 1; i <= m; i++) {
      const temp = dp[i]
      dp[i] = a[i - 1] === b[j - 1] ? prevDiagonal : 1 + Math.min(prevDiagonal, dp[i], dp[i - 1])
      prevDiagonal = temp
    }
  }
  return dp[m]
}

/** Lowercased, diacritic-stripped, punctuation-stripped, whitespace-
 * collapsed — so "Aïcha  Bennani" and "aicha bennani" compare equal. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** 0 (nothing alike) to 1 (identical after normalization) — Levenshtein
 * distance scaled by the longer name's length. Used for "near-match but
 * different spelling" fuzziness; exact-field matches (licence/ID number,
 * phone, email) use their own normalize-then-strict-equality instead,
 * deliberately not fuzzy. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na && !nb) return 1
  if (!na || !nb) return 0
  const maxLen = Math.max(na.length, nb.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(na, nb) / maxLen
}

/** Uppercased with whitespace/dashes stripped, so "MA 204471" and
 * "ma-204471" compare equal for licence/ID number matching. */
export function normalizeIdLike(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "")
}

/** Digits only — "+212 661-234567" and "212661234567" compare equal.
 * Deliberately doesn't attempt country-code normalization (e.g.
 * reconciling a local "0661234567" against an international
 * "212661234567" form of the same number) — a full phone-number parser
 * is out of scope here, same restraint as normalizeIdLike's simple
 * approach; see docs/customer-intelligence.md. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "")
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Scores one existing customer against a candidate's identity fields.
 * Exact matches on id-document/licence number are the strongest signal
 * (55 points each — practically unique to one person). Phone and email
 * are real but weaker signals (40 points each) — deliberately below
 * the id-document tier and below DUPLICATE_LIKELY_THRESHOLD alone,
 * because either can legitimately be shared between different people
 * (a family phone line, a shared inbox) — but still at or above
 * DUPLICATE_SURFACE_THRESHOLD alone, so an exact phone/email reuse is
 * never silently invisible either; it surfaces as a "review later"
 * signal even with no other match; combined with a name match it
 * clears the "likely duplicate" bar. Date of birth (15 points) is
 * weaker still — many unrelated people share a birth date — and name
 * similarity only contributes above a fuzziness floor (0.85), capped
 * so a shared name alone can reach the surface threshold but never the
 * "likely duplicate" one. */
export function scoreCustomerMatch(
  candidate: CustomerMatchCandidate,
  existing: ExistingCustomerRecord
): { confidence: number; matchedFields: string[] } {
  let score = 0
  const matchedFields: string[] = []

  if (
    candidate.idDocumentNumber &&
    existing.idDocumentNumber &&
    normalizeIdLike(candidate.idDocumentNumber) === normalizeIdLike(existing.idDocumentNumber)
  ) {
    score += 55
    matchedFields.push("idDocumentNumber")
  }

  if (
    candidate.licenseNumber &&
    existing.licenseNumber &&
    normalizeIdLike(candidate.licenseNumber) === normalizeIdLike(existing.licenseNumber)
  ) {
    score += 55
    matchedFields.push("licenseNumber")
  }

  if (candidate.phone && existing.phone && normalizePhone(candidate.phone) === normalizePhone(existing.phone)) {
    score += 40
    matchedFields.push("phone")
  }

  if (candidate.email && existing.email && normalizeEmail(candidate.email) === normalizeEmail(existing.email)) {
    score += 40
    matchedFields.push("email")
  }

  if (candidate.dateOfBirth && existing.dateOfBirth && candidate.dateOfBirth === existing.dateOfBirth) {
    score += 15
    matchedFields.push("dateOfBirth")
  }

  const similarity = nameSimilarity(candidate.fullName, existing.fullName)
  if (similarity >= 0.85) {
    score += Math.round(similarity * 40)
    matchedFields.push("fullName")
  }

  return { confidence: Math.min(100, score), matchedFields }
}

/** Scores `candidate` against every record in `pool` and returns the
 * ones at or above DUPLICATE_SURFACE_THRESHOLD, highest confidence
 * first. `excludeCustomerId` skips a record — e.g. when re-checking an
 * existing customer's own updated profile, or a document already known
 * to belong to a specific customer (cross-document duplicate detection
 * per phase 04 requirement 5's "compare extracted identity fields ...
 * against existing customers"). */
export function findDuplicateMatches(
  candidate: CustomerMatchCandidate,
  pool: ExistingCustomerRecord[],
  excludeCustomerId?: string
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []

  for (const existing of pool) {
    if (excludeCustomerId && existing.id === excludeCustomerId) continue
    const { confidence, matchedFields } = scoreCustomerMatch(candidate, existing)
    if (confidence >= DUPLICATE_SURFACE_THRESHOLD) {
      matches.push({
        customerId: existing.id,
        fullName: existing.fullName,
        confidence,
        matchedFields,
        isLikelyDuplicate: confidence >= DUPLICATE_LIKELY_THRESHOLD,
      })
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence)
}
