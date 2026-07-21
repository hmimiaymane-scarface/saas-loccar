import type { ActivityItem } from "@/types/rental"

// vehicleId/reservationId below match lib/mock/vehicles.ts and
// lib/mock/bookings.ts's real ids for the vehicles/plates named in each
// description — lets getActivityLogList's vehicleId filter (used by the
// phase 07 vehicle timeline) return real results in mock mode instead
// of always being empty.
export const recentActivity: ActivityItem[] = [
  {
    id: "act_1",
    type: "payment_recorded",
    title: "Payment received",
    description: "Ahmed Tazi paid 1,200 MAD toward booking #RB-3391",
    timestamp: "2026-07-18T09:42:00+01:00",
    actor: "Youssef El Amrani",
  },
  {
    id: "act_2",
    type: "vehicle_returned",
    title: "Vehicle returned",
    description: "Renault Clio 5 (51093-ب-6) returned by Sara Bennis",
    timestamp: "2026-07-18T08:55:00+01:00",
    actor: "Hamza Berrada",
    vehicleId: "veh_4",
  },
  {
    id: "act_3",
    type: "reservation_confirmed",
    title: "Reservation confirmed",
    description: "Toyota Yaris booked for Laila Fassi, Jul 21 – Jul 25",
    timestamp: "2026-07-17T18:20:00+01:00",
    actor: "Youssef El Amrani",
    vehicleId: "veh_11",
  },
  {
    id: "act_4",
    type: "document_uploaded",
    title: "Contract uploaded",
    description: "Signed contract added to Mehdi Chraibi's booking #RB-3388",
    timestamp: "2026-07-17T16:05:00+01:00",
    actor: "Hamza Berrada",
  },
  {
    id: "act_5",
    type: "vehicle_picked_up",
    title: "Vehicle picked up",
    description: "Hyundai Tucson (55302-ب-6) picked up by Omar Naciri",
    timestamp: "2026-07-17T11:30:00+01:00",
    actor: "Youssef El Amrani",
    vehicleId: "veh_9",
  },
  {
    id: "act_6",
    type: "maintenance_completed",
    title: "Maintenance logged",
    description: "Oil change recorded for Dacia Duster (48812-ه-6)",
    timestamp: "2026-07-16T14:12:00+01:00",
    actor: "Hamza Berrada",
    vehicleId: "veh_7",
  },
  {
    id: "act_7",
    type: "vehicle_status_changed",
    title: "Vehicle marked available",
    description: "Dacia Duster (48812-ه-6) marked available after maintenance",
    timestamp: "2026-07-16T14:15:00+01:00",
    actor: "Hamza Berrada",
    vehicleId: "veh_7",
  },
]
