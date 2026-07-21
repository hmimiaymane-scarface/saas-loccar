-- Phase 07 of the RentalOS build roadmap ("Vehicle Command Center &
-- Timeline") requirement 3: a short AI-generated summary of "what's
-- happening with this vehicle right now" for the Overview section.
--
-- Generated in the same askAI() call as phase 06's recommendations
-- (lib/vehicle-recommendations.ts#generateVehicleInsights) rather than
-- a second call — both are grounded in the same health/profitability/
-- utilization snapshot, and a second round-trip to the model for one
-- more sentence would double the cost for no real benefit. Cached
-- alongside the rest of vehicle_intelligence so the vehicle detail page
-- reads it, never recomputes it inline (requirement 6).
alter table public.vehicle_intelligence
  add column summary text;
