/**
 * The single source of truth for inspection photo angles — previously
 * defined identically-but-separately in pickup-wizard.tsx and
 * return-wizard.tsx (roadmap phase 15 deduplicated them here since a
 * third consumer, the required-photo completeness check, now needs the
 * same list). The `key` is what's stored in `media.caption` when a
 * photo is uploaded (see attachInspectionMedia) — this exact set of
 * keys must also match the array hardcoded in complete_inspection()
 * (supabase/migrations/20260802090000_inspection_photo_completeness.sql),
 * since Postgres can't import a TypeScript constant.
 */
export interface PhotoSlotDef {
  key: string
  label: string
}

export const PHOTO_SLOTS: PhotoSlotDef[] = [
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "driver_side", label: "Driver side" },
  { key: "passenger_side", label: "Passenger side" },
  { key: "interior", label: "Interior" },
  { key: "dashboard_odometer", label: "Odometer" },
  { key: "fuel_gauge", label: "Fuel gauge" },
]

export const REQUIRED_PHOTO_SLOT_KEYS: string[] = PHOTO_SLOTS.map((s) => s.key)
