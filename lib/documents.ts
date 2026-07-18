import type { DocumentCategory } from "@/types/rental"

// Plain data, deliberately not exported from a "use client" module — a
// Server Component (e.g. document-list-item.tsx) importing a constant
// from a client component doesn't resolve to the real value under the
// App Router's client-boundary bundling, only components do.
export const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: "rental_contract", label: "Rental contract" },
  { value: "identity_document", label: "Identity document" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "insurance_document", label: "Insurance document" },
  { value: "vehicle_registration", label: "Vehicle registration" },
  { value: "technical_inspection", label: "Technical inspection" },
  { value: "payment_receipt", label: "Payment receipt" },
  { value: "other", label: "Other" },
]
