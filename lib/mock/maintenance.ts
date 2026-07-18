import type { MaintenanceAlert } from "@/types/rental"

export const maintenanceAlerts: MaintenanceAlert[] = [
  {
    id: "maint_1",
    vehicle: { id: "veh_8", make: "Dacia", model: "Duster", plate: "31567-ه-6" },
    type: "tire",
    title: "Rear tyre replacement",
    dueDate: "2026-07-18",
    severity: "critical",
  },
  {
    id: "maint_2",
    vehicle: { id: "veh_18", make: "Dacia", model: "Sandero", plate: "33481-أ-6" },
    type: "insurance_renewal",
    title: "Insurance renewal",
    dueDate: "2026-07-20",
    severity: "critical",
  },
  {
    id: "maint_3",
    vehicle: { id: "veh_10", make: "Toyota", model: "Hilux", plate: "22908-د-1" },
    type: "oil_change",
    title: "Oil and filter change",
    dueDate: "2026-07-24",
    severity: "warning",
  },
  {
    id: "maint_4",
    vehicle: { id: "veh_24", make: "Dacia", model: "Duster", plate: "61045-أ-6" },
    type: "inspection",
    title: "First technical inspection",
    dueDate: "2026-08-02",
    severity: "info",
  },
  {
    id: "maint_5",
    vehicle: { id: "veh_2", make: "Dacia", model: "Logan", plate: "38210-أ-6" },
    type: "registration_renewal",
    title: "Vignette renewal",
    dueDate: "2026-08-10",
    severity: "info",
  },
]
