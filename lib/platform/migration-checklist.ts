/**
 * Roadmap phase 49 (Founder-Assisted Migration Mode) — the fixed
 * definition of the 8-step white-glove onboarding checklist a platform
 * admin tracks per client company (see
 * docs/founder-assisted-migration.md). Pure, no Supabase dependency:
 * `step_key` here is the single source of truth mirrored by the
 * `migration_checklist_items` rows seeded in
 * supabase/migrations/20260814090000_phase49_migration_checklist.sql
 * (`seed_migration_checklist()`) — if either side's step list changes,
 * both must change together.
 */

export interface MigrationChecklistStepDef {
  key: string
  label: string
  description: string
}

export const MIGRATION_CHECKLIST_STEPS: MigrationChecklistStepDef[] = [
  {
    key: "spreadsheet_received",
    label: "Spreadsheet received",
    description: "Got the client's current fleet/customer spreadsheet.",
  },
  {
    key: "spreadsheet_cleaned",
    label: "Spreadsheet cleaned",
    description: "Headers and values tidied up so the importer can read it.",
  },
  {
    key: "data_imported",
    label: "Data imported",
    description: "Vehicles and customers imported via /import.",
  },
  {
    key: "import_counts_validated",
    label: "Import counts validated",
    description: "Imported row counts cross-checked against the source spreadsheet.",
  },
  {
    key: "logo_uploaded",
    label: "Logo uploaded",
    description: "Company logo set, via Settings or the onboarding wizard.",
  },
  {
    key: "contract_template_set",
    label: "Contract template set",
    description: "At least one contract template ready to use.",
  },
  {
    key: "owner_login_created",
    label: "Owner login created",
    description: "The client's own owner account exists — always true the moment the company itself exists.",
  },
  {
    key: "first_reservation_tested",
    label: "First reservation tested",
    description: "Walked the client through creating one real reservation end-to-end.",
  },
]

/** Counts how many of a company's checklist items are marked done —
 * used for both the migration-checklist panel's own progress line and
 * the company summary page's "Onboarding" field. */
export function migrationChecklistProgress(items: { isDone: boolean }[]): { done: number; total: number } {
  return { done: items.filter((item) => item.isDone).length, total: items.length }
}
