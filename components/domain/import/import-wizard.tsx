"use client"

import { useMemo, useState } from "react"
import { Upload, Download, AlertTriangle, CheckCircle2 } from "lucide-react"

import { getVehicleDedupPool, getCustomerDedupPool, commitVehicleImport, commitCustomerImport, type RowError } from "@/app/(dashboard)/import/actions"
import { parseCsv, toCsv } from "@/lib/csv"
import { suggestColumnMapping, VEHICLE_IMPORT_FIELDS, CUSTOMER_IMPORT_FIELDS, type ImportTargetField } from "@/lib/import/column-matching"
import { validateVehicleImportRows, type VehicleImportRawRow, type VehicleImportRowResult } from "@/lib/import/vehicle-import"
import { validateCustomerImportRows, type CustomerImportRawRow, type CustomerImportRowResult } from "@/lib/import/customer-import"
import { normalizeIdLike } from "@/lib/customer-matching"
import { useSubmitGuard } from "@/hooks/use-submit-guard"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { WizardFooter } from "@/components/domain/wizard-footer"

type EntityType = "vehicle" | "customer"

const STEPS = [{ label: "Choose file" }, { label: "Match columns" }, { label: "Review" }, { label: "Done" }]

interface RowOutcome {
  rowNumber: number
  label: string
  errors: string[]
  isDuplicate: boolean
  duplicateLabel: string | null
}

function buildRawRow(fields: ImportTargetField[], mapping: Record<string, number | null>, row: string[]): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const field of fields) {
    const index = mapping[field.key]
    raw[field.key] = index != null ? (row[index] ?? "") : ""
  }
  return raw
}

function outcomesFromVehicleResults(results: VehicleImportRowResult[]): RowOutcome[] {
  return results.map((r) => ({
    rowNumber: r.rowNumber,
    label: r.data ? `${r.data.make} ${r.data.model} — ${r.data.registrationNumber}` : `Row ${r.rowNumber}`,
    errors: r.errors,
    isDuplicate: r.isDuplicate,
    duplicateLabel: r.duplicateReason,
  }))
}

function outcomesFromCustomerResults(results: CustomerImportRowResult[]): RowOutcome[] {
  return results.map((r) => ({
    rowNumber: r.rowNumber,
    label: r.data ? `${r.data.fullName} (${r.data.phone})` : `Row ${r.rowNumber}`,
    errors: r.errors,
    isDuplicate: r.isDuplicate,
    duplicateLabel: r.duplicateMatches[0]
      ? `Matches existing customer "${r.duplicateMatches[0].fullName}" (${r.duplicateMatches[0].confidence}% match)`
      : null,
  }))
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ImportWizard() {
  const [step, setStep] = useState(0)
  const [entityType, setEntityType] = useState<EntityType | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number | null>>({})
  const [fileError, setFileError] = useState<string | null>(null)

  const [vehicleResults, setVehicleResults] = useState<VehicleImportRowResult[] | null>(null)
  const [customerResults, setCustomerResults] = useState<CustomerImportRowResult[] | null>(null)
  const [overrideDuplicates, setOverrideDuplicates] = useState(false)
  const [commitSummary, setCommitSummary] = useState<{ insertedCount: number; rowErrors: RowError[] } | null>(null)

  const previewGuard = useSubmitGuard()
  const commitGuard = useSubmitGuard()

  const fields = entityType === "vehicle" ? VEHICLE_IMPORT_FIELDS : entityType === "customer" ? CUSTOMER_IMPORT_FIELDS : []

  const outcomes: RowOutcome[] = useMemo(() => {
    if (entityType === "vehicle" && vehicleResults) return outcomesFromVehicleResults(vehicleResults)
    if (entityType === "customer" && customerResults) return outcomesFromCustomerResults(customerResults)
    return []
  }, [entityType, vehicleResults, customerResults])

  const validCount = outcomes.filter((o) => o.errors.length === 0 && !o.isDuplicate).length
  const duplicateCount = outcomes.filter((o) => o.errors.length === 0 && o.isDuplicate).length
  const errorCount = outcomes.filter((o) => o.errors.length > 0).length
  const willImportCount = validCount + (overrideDuplicates ? duplicateCount : 0)

  function resetAll() {
    setStep(0)
    setEntityType(null)
    setFileName(null)
    setHeaders([])
    setDataRows([])
    setMapping({})
    setFileError(null)
    setVehicleResults(null)
    setCustomerResults(null)
    setOverrideDuplicates(false)
    setCommitSummary(null)
  }

  async function handleFileChange(file: File, chosenEntityType: EntityType) {
    setFileError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setFileError("This file has no data rows — nothing to import.")
        return
      }
      const targetFields = chosenEntityType === "vehicle" ? VEHICLE_IMPORT_FIELDS : CUSTOMER_IMPORT_FIELDS
      setEntityType(chosenEntityType)
      setFileName(file.name)
      setHeaders(parsed.headers)
      setDataRows(parsed.rows)
      setMapping(suggestColumnMapping(parsed.headers, targetFields))
      setStep(1)
    } catch {
      setFileError("Couldn't read this file. Make sure it's a plain CSV file (export from Excel/Sheets as CSV if needed).")
    }
  }

  function runPreview() {
    previewGuard.run(async () => {
      const rawRows = dataRows.map((row) => buildRawRow(fields, mapping, row))

      if (entityType === "vehicle") {
        const poolResult = await getVehicleDedupPool()
        if (poolResult.error) return { error: poolResult.error }
        const existingPlates = new Set((poolResult.data ?? []).map((p) => normalizeIdLike(p)))
        setVehicleResults(validateVehicleImportRows(rawRows as VehicleImportRawRow[], existingPlates))
      } else if (entityType === "customer") {
        const poolResult = await getCustomerDedupPool()
        if (poolResult.error) return { error: poolResult.error }
        setCustomerResults(validateCustomerImportRows(rawRows as CustomerImportRawRow[], poolResult.data ?? []))
      }
      setStep(2)
    })
  }

  function runCommit() {
    commitGuard.run(async () => {
      if (entityType === "vehicle" && vehicleResults) {
        const rows = vehicleResults
          .filter((r) => r.data && (!r.isDuplicate || overrideDuplicates))
          .map((r) => ({ rowNumber: r.rowNumber, data: r.data! }))
        const result = await commitVehicleImport(rows)
        if (result.error) return { error: result.error }
        setCommitSummary({ insertedCount: result.insertedCount ?? 0, rowErrors: result.rowErrors ?? [] })
        setStep(3)
        return
      }
      if (entityType === "customer" && customerResults) {
        const rows = customerResults
          .filter((r) => r.data && (!r.isDuplicate || overrideDuplicates))
          .map((r) => ({ rowNumber: r.rowNumber, data: r.data! }))
        const result = await commitCustomerImport(rows)
        if (result.error) return { error: result.error }
        setCommitSummary({ insertedCount: result.insertedCount ?? 0, rowErrors: result.rowErrors ?? [] })
        setStep(3)
      }
    })
  }

  function downloadErrorReport() {
    const errorRows = outcomes.filter((o) => o.errors.length > 0)
    const csv = toCsv(errorRows, [
      { header: "Row", value: (r) => r.rowNumber },
      { header: "Record", value: (r) => r.label },
      { header: "Reason", value: (r) => r.errors.join("; ") },
    ])
    downloadCsv("import-errors.csv", csv)
  }

  const missingRequired = fields.filter((f) => f.required && mapping[f.key] == null)

  return (
    <div className="flex w-full flex-col gap-6">
      <WizardProgress steps={STEPS} currentStep={step} />

      {step === 0 && <ChooseFileStep fileError={fileError} onFile={handleFileChange} />}

      {step === 1 && entityType && (
        <MapColumnsStep
          fields={fields}
          headers={headers}
          sampleRow={dataRows[0] ?? []}
          mapping={mapping}
          onChange={setMapping}
          missingRequired={missingRequired}
          isPending={previewGuard.status === "pending" || previewGuard.status === "slow"}
          error={previewGuard.error}
          onBack={() => {
            setStep(0)
            setFileName(null)
          }}
          onContinue={runPreview}
        />
      )}

      {step === 2 && entityType && (
        <PreviewStep
          entityType={entityType}
          fileName={fileName}
          outcomes={outcomes}
          validCount={validCount}
          duplicateCount={duplicateCount}
          errorCount={errorCount}
          willImportCount={willImportCount}
          overrideDuplicates={overrideDuplicates}
          onOverrideChange={setOverrideDuplicates}
          onDownloadErrors={downloadErrorReport}
          isPending={commitGuard.status === "pending" || commitGuard.status === "slow"}
          error={commitGuard.error}
          onBack={() => setStep(1)}
          onContinue={runCommit}
        />
      )}

      {step === 3 && commitSummary && entityType && (
        <DoneStep entityType={entityType} summary={commitSummary} onStartAnother={resetAll} />
      )}
    </div>
  )
}

function ChooseFileStep({
  fileError,
  onFile,
}: {
  fileError: string | null
  onFile: (file: File, entityType: EntityType) => void
}) {
  const [pendingEntityType, setPendingEntityType] = useState<EntityType>("vehicle")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">What are you importing?</CardTitle>
        <CardDescription>A plain CSV file — export one from Excel or Google Sheets if that&apos;s where your data lives today.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={pendingEntityType === "vehicle" ? "default" : "outline"}
            onClick={() => setPendingEntityType("vehicle")}
          >
            Vehicles
          </Button>
          <Button
            type="button"
            variant={pendingEntityType === "customer" ? "default" : "outline"}
            onClick={() => setPendingEntityType("customer")}
          >
            Customers
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-file">CSV file</Label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            className="text-sm text-foreground file:mr-3 file:rounded-2xl file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file, pendingEntityType)
              e.target.value = ""
            }}
          />
          <p className="text-xs text-muted-foreground">Only .csv is supported today — a real Excel (.xlsx) file needs exporting to CSV first.</p>
        </div>

        {fileError && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {fileError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function MapColumnsStep({
  fields,
  headers,
  sampleRow,
  mapping,
  onChange,
  missingRequired,
  isPending,
  error,
  onBack,
  onContinue,
}: {
  fields: ImportTargetField[]
  headers: string[]
  sampleRow: string[]
  mapping: Record<string, number | null>
  onChange: (mapping: Record<string, number | null>) => void
  missingRequired: ImportTargetField[]
  isPending: boolean
  error: string | null
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Match your columns</CardTitle>
        <CardDescription>
          We matched what we could from your file&apos;s headers — check each one, especially the required fields, before continuing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {fields.map((field) => {
            const selected = mapping[field.key]
            const sample = selected != null ? sampleRow[selected] : undefined
            return (
              <div key={field.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-3 sm:gap-4">
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                <NativeSelect
                  value={selected == null ? "" : String(selected)}
                  onChange={(e) => onChange({ ...mapping, [field.key]: e.target.value === "" ? null : Number(e.target.value) })}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </NativeSelect>
                <span className="truncate text-xs text-muted-foreground">{sample ? `e.g. "${sample}"` : ""}</span>
              </div>
            )
          })}
        </div>

        {missingRequired.length > 0 && (
          <p className="mt-4 text-sm text-destructive">
            Map a column for: {missingRequired.map((f) => f.label).join(", ")}.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </CardContent>
      <div className="px-6 pb-6">
        <WizardFooter
          onBack={onBack}
          onContinue={onContinue}
          continueLabel="Preview import"
          continueDisabled={missingRequired.length > 0}
          continuePending={isPending}
        />
      </div>
    </Card>
  )
}

function outcomeBadge(outcome: RowOutcome) {
  if (outcome.errors.length > 0) return <Badge variant="destructive">Error</Badge>
  if (outcome.isDuplicate) return <Badge variant="outline">Duplicate</Badge>
  return <Badge>Ready</Badge>
}

function PreviewStep({
  entityType,
  fileName,
  outcomes,
  validCount,
  duplicateCount,
  errorCount,
  willImportCount,
  overrideDuplicates,
  onOverrideChange,
  onDownloadErrors,
  isPending,
  error,
  onBack,
  onContinue,
}: {
  entityType: EntityType
  fileName: string | null
  outcomes: RowOutcome[]
  validCount: number
  duplicateCount: number
  errorCount: number
  willImportCount: number
  overrideDuplicates: boolean
  onOverrideChange: (value: boolean) => void
  onDownloadErrors: () => void
  isPending: boolean
  error: string | null
  onBack: () => void
  onContinue: () => void
}) {
  const displayRows = outcomes.slice(0, 50)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review before importing</CardTitle>
        <CardDescription>{fileName ? `${fileName} — ` : ""}{outcomes.length} row{outcomes.length === 1 ? "" : "s"} found.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-foreground">
            <strong>{validCount}</strong> ready to import
          </span>
          <span className="text-foreground">
            <strong>{duplicateCount}</strong> flagged as possible duplicates
          </span>
          <span className="text-foreground">
            <strong>{errorCount}</strong> couldn&apos;t be read
          </span>
        </div>

        {duplicateCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={overrideDuplicates} onChange={(e) => onOverrideChange(e.target.checked)} />
            Import the {duplicateCount} flagged duplicate{duplicateCount === 1 ? "" : "s"} anyway
          </label>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">{entityType === "vehicle" ? "Vehicle" : "Customer"}</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((outcome) => (
                <tr key={outcome.rowNumber} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{outcome.rowNumber}</td>
                  <td className="px-3 py-2 text-foreground">{outcome.label}</td>
                  <td className="px-3 py-2">{outcomeBadge(outcome)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {outcome.errors.length > 0 ? outcome.errors.join("; ") : outcome.duplicateLabel ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {outcomes.length > displayRows.length && (
          <p className="text-xs text-muted-foreground">
            +{outcomes.length - displayRows.length} more row{outcomes.length - displayRows.length === 1 ? "" : "s"} not shown here — every row above still gets processed.
          </p>
        )}

        {errorCount > 0 && (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onDownloadErrors}>
            <Download className="size-4" />
            Download error report
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <div className="px-6 pb-6">
        <WizardFooter
          onBack={onBack}
          onContinue={onContinue}
          continueLabel={`Import ${willImportCount} row${willImportCount === 1 ? "" : "s"}`}
          continueDisabled={willImportCount === 0}
          continuePending={isPending}
        />
      </div>
    </Card>
  )
}

function DoneStep({
  entityType,
  summary,
  onStartAnother,
}: {
  entityType: EntityType
  summary: { insertedCount: number; rowErrors: RowError[] }
  onStartAnother: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle2 className="size-5 text-primary" />
          Import complete
        </CardTitle>
        <CardDescription>
          {summary.insertedCount} {entityType === "vehicle" ? "vehicle" : "customer"}
          {summary.insertedCount === 1 ? "" : "s"} imported
          {summary.rowErrors.length > 0 ? `, ${summary.rowErrors.length} row(s) failed at save time` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {summary.rowErrors.length > 0 && (
          <div className="rounded-2xl border border-border p-3 text-sm">
            <p className="mb-1 font-medium text-foreground">Rows that failed to save</p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {summary.rowErrors.map((e) => (
                <li key={e.rowNumber}>
                  Row {e.rowNumber}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          See &quot;Recent imports&quot; above if you need to undo this import.
        </p>
        <Button type="button" onClick={onStartAnother} className="w-fit">
          <Upload className="size-4" />
          Start another import
        </Button>
      </CardContent>
    </Card>
  )
}

export { ImportWizard }
