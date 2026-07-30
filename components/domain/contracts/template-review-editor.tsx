"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2, Sparkles } from "lucide-react"

import type { TemplateSection, SectionCondition, ConditionOperator } from "@/lib/contracts/template-engine"
import type { VariableMapping } from "@/lib/contracts/template-store"
import { CONTRACT_VARIABLE_CATALOG } from "@/lib/contracts/variables"
import { saveEditedVersionAction } from "@/app/(dashboard)/contract-templates/actions"
import { toneClasses } from "@/lib/tone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const CONDITION_NONE = "__none__"

function ConditionEditor({
  condition,
  onChange,
}: {
  condition: SectionCondition | null
  onChange: (next: SectionCondition | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Only include when</span>
      <NativeSelect
        className="w-56"
        value={condition?.fieldPath ?? CONDITION_NONE}
        onChange={(e) => {
          if (e.target.value === CONDITION_NONE) {
            onChange(null)
          } else {
            onChange({ fieldPath: e.target.value, operator: condition?.operator ?? "exists", value: condition?.value })
          }
        }}
      >
        <option value={CONDITION_NONE}>Always included</option>
        {CONTRACT_VARIABLE_CATALOG.map((v) => (
          <option key={v.fieldPath} value={v.fieldPath}>
            {v.label}
          </option>
        ))}
      </NativeSelect>
      {condition && (
        <>
          <NativeSelect
            className="w-32"
            value={condition.operator}
            onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
          >
            <option value="exists">exists</option>
            <option value="equals">equals</option>
          </NativeSelect>
          {condition.operator === "equals" && (
            <Input
              className="w-40"
              value={condition.value ?? ""}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
              placeholder="true"
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Roadmap phase 10 requirement 2's actual review UI, and requirement
 * 4's condition configuration. Works on ANY version passed in
 * (pending_review, active, or archived) — but saving never mutates
 * that version; `saveEditedVersionAction` always inserts a fresh one
 * (requirement 6). "Save and activate" chains the create + the real
 * review-confirmation gate in one click for the common case; "Save as
 * draft" only creates it, leaving whatever's currently active
 * untouched for a second pass later.
 */
function TemplateReviewEditor({
  templateId,
  initialSections,
  initialVariableMappings,
  initialLegalFooterText,
  aiNotes,
  isActive,
}: {
  templateId: string
  initialSections: TemplateSection[]
  initialVariableMappings: VariableMapping[]
  initialLegalFooterText: string | null
  aiNotes: string | null
  isActive: boolean
}) {
  const router = useRouter()
  const [sections, setSections] = useState<TemplateSection[]>(initialSections)
  const [mappings, setMappings] = useState<VariableMapping[]>(initialVariableMappings)
  const [legalFooterText, setLegalFooterText] = useState(initialLegalFooterText ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function updateSection(id: string, patch: Partial<TemplateSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  function updateMapping(index: number, patch: Partial<VariableMapping>) {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function removeMapping(index: number) {
    setMappings((prev) => prev.filter((_, i) => i !== index))
  }

  function save(activateImmediately: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await saveEditedVersionAction({
        templateId,
        sections,
        variableMappings: mappings,
        legalFooterText: legalFooterText.trim() || null,
        activateImmediately,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/contract-templates/${templateId}`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {aiNotes && (
        <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="whitespace-pre-wrap">{aiNotes}</p>
        </div>
      )}

      {isActive && (
        <p className={`rounded-2xl px-4 py-3 text-sm ${toneClasses.warning.badge}`}>
          This version is currently active. Saving creates a new version instead of changing this one — activate it to make it live.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sections</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  className="font-medium"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeSection(section.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Textarea
                value={section.bodyText}
                onChange={(e) => updateSection(section.id, { bodyText: e.target.value })}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use <code>{"{{field.path}}"}</code> to insert a value — see the mappings below for available fields.
              </p>
              <ConditionEditor condition={section.condition} onChange={(next) => updateSection(section.id, { condition: next })} />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setSections((prev) => [
                ...prev,
                { id: crypto.randomUUID(), title: "New section", bodyText: "", condition: null },
              ])
            }
          >
            <Plus />
            Add section
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variable mappings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mappings.map((mapping, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={mapping.placeholder} onChange={(e) => updateMapping(index, { placeholder: e.target.value })} placeholder="[CUSTOMER NAME]" />
              <NativeSelect value={mapping.fieldPath} onChange={(e) => updateMapping(index, { fieldPath: e.target.value })}>
                {CONTRACT_VARIABLE_CATALOG.map((v) => (
                  <option key={v.fieldPath} value={v.fieldPath}>
                    {v.label}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeMapping(index)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setMappings((prev) => [...prev, { placeholder: "", fieldPath: CONTRACT_VARIABLE_CATALOG[0].fieldPath, label: "" }])
            }
          >
            <Plus />
            Add mapping
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legal footer</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={legalFooterText}
            onChange={(e) => setLegalFooterText(e.target.value)}
            rows={3}
            placeholder="Optional small print printed at the bottom of every contract from this template."
          />
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Separator />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          {pending && <Loader2 className="animate-spin" />}
          Save as draft
        </Button>
        <Button type="button" disabled={pending} onClick={() => save(true)}>
          {pending && <Loader2 className="animate-spin" />}
          Save and activate
        </Button>
      </div>
    </div>
  )
}

export { TemplateReviewEditor }
