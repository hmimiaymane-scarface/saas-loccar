import type { RentalCompany, Employee } from "@/types/rental"

export const currentCompany: RentalCompany = {
  id: "co_atlas",
  name: "Atlas Rent Car",
  slug: "atlas-rent-car",
  city: "Marrakech",
  country: "Morocco",
  currency: "MAD",
  timezone: "Africa/Casablanca",
  status: "active",
  maintenanceReminderDays: 14,
  documentExpiryWarningDays: 30,
  agentsCanRecordExpenses: false,
  mutedNotificationTypes: [],
  logoUrl: null,
  email: "contact@atlasrentcar.ma",
  address: null,
  defaultDepositMad: 3000,
  overdueGracePeriodHours: 0,
}

export const currentEmployee: Employee = {
  id: "emp_1",
  fullName: "Youssef El Amrani",
  role: "owner",
  email: "youssef@atlasrentcar.ma",
}
