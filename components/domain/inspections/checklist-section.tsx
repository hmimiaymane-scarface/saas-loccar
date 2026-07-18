"use client"

import { cn } from "@/lib/utils"
import type { ChecklistResponseValue, ChecklistTemplateItem } from "@/types/rental"

const RESPONSE_OPTIONS: { value: ChecklistResponseValue; label: string; activeClass: string }[] = [
  { value: "good", label: "Good", activeClass: "bg-emerald-500 text-white border-emerald-500" },
  { value: "damaged", label: "Damaged", activeClass: "bg-red-500 text-white border-red-500" },
  { value: "missing", label: "Missing", activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "not_applicable", label: "N/A", activeClass: "bg-zinc-500 text-white border-zinc-500" },
]

const CATEGORY_LABELS: Record<string, string> = {
  condition: "Vehicle condition",
  documents_and_items: "Documents & items",
}

function ChecklistItemRow({
  item,
  response,
  onChange,
}: {
  item: ChecklistTemplateItem
  response: ChecklistResponseValue
  onChange: (value: ChecklistResponseValue) => void
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-foreground">{item.label}</span>
      <div className="flex gap-1.5">
        {RESPONSE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-9 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted",
              response === opt.value && opt.activeClass
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChecklistSection({
  template,
  responses,
  onChangeResponse,
}: {
  template: ChecklistTemplateItem[]
  responses: Record<string, ChecklistResponseValue>
  onChangeResponse: (item: ChecklistTemplateItem, value: ChecklistResponseValue) => void
}) {
  const grouped = template.reduce<Record<string, ChecklistTemplateItem[]>>((acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="flex flex-col">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[category] ?? category}
          </p>
          <div className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <ChecklistItemRow
                key={item.key}
                item={item}
                response={responses[item.key] ?? "good"}
                onChange={(value) => onChangeResponse(item, value)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export { ChecklistSection, ChecklistItemRow }
