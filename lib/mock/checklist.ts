import type { ChecklistTemplateItem } from "@/types/rental"

export const checklistTemplate: ChecklistTemplateItem[] = [
  { id: "tpl_1", key: "exterior_condition", label: "Exterior condition", category: "condition", sortOrder: 1 },
  { id: "tpl_2", key: "interior_condition", label: "Interior condition", category: "condition", sortOrder: 2 },
  { id: "tpl_3", key: "tyres", label: "Tyres", category: "condition", sortOrder: 3 },
  { id: "tpl_4", key: "spare_wheel", label: "Spare wheel or repair kit", category: "condition", sortOrder: 4 },
  { id: "tpl_5", key: "lights", label: "Lights", category: "condition", sortOrder: 5 },
  { id: "tpl_6", key: "mirrors", label: "Mirrors", category: "condition", sortOrder: 6 },
  { id: "tpl_7", key: "windows", label: "Windows", category: "condition", sortOrder: 7 },
  { id: "tpl_8", key: "air_conditioning", label: "Air conditioning", category: "condition", sortOrder: 8 },
  { id: "tpl_9", key: "dashboard_warnings", label: "Dashboard warnings", category: "condition", sortOrder: 9 },
  { id: "tpl_10", key: "vehicle_documents", label: "Vehicle documents", category: "documents_and_items", sortOrder: 10 },
  { id: "tpl_11", key: "keys", label: "Keys", category: "documents_and_items", sortOrder: 11 },
  { id: "tpl_12", key: "safety_equipment", label: "Safety equipment", category: "documents_and_items", sortOrder: 12 },
  { id: "tpl_13", key: "accessories", label: "Accessories supplied by the agency", category: "documents_and_items", sortOrder: 13 },
]
