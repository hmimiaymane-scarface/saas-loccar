-- Local development seed data: one realistic Moroccan rental company
-- ("Atlas Rent Car"), a small but varied fleet, customers, reservations in
-- different statuses, external payment records, maintenance and activity.
--
-- Runs automatically after `supabase db reset` (or `supabase db reset
-- --local`). It is NOT applied to a hosted project by `supabase db push` —
-- migrations and seed data are separate concerns on purpose.
--
-- Part 1 creates a local-only test login directly in the `auth` schema.
-- This is a well-known pattern for local Supabase seeding, but the auth
-- schema's exact columns are an internal implementation detail of GoTrue
-- and can shift between CLI versions. If this block errors on your
-- version: skip it, sign up for real at /sign-up instead (email
-- owner@atlasrentcar.ma or any address you like), grab that user's id from
-- Studio -> Authentication -> Users, and substitute it for
-- 'a0000000-0000-0000-0000-000000000002' everywhere below before
-- re-running Part 2.
--
-- Seeded login: owner@atlasrentcar.ma / Password123!
--
-- ID scheme (all valid hex so they're legal uuid literals):
--   ...0001 company        ...1001-1006 vehicles
--   ...0002 owner user     ...2001-2004 customers
--   ...0003 branch         ...3001-3005 reservations

-- ---------------------------------------------------------------------
-- Part 1: auth user
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated',
  'owner@atlasrentcar.ma',
  crypt('Password123!', gen_salt('bf')),
  now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Youssef El Amrani"}',
  now(), now(),
  '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000002',
  format(
    '{"sub":"%s","email":"%s"}',
    'a0000000-0000-0000-0000-000000000002',
    'owner@atlasrentcar.ma'
  )::jsonb,
  'email',
  'a0000000-0000-0000-0000-000000000002',
  now(), now(), now()
)
on conflict do nothing;

-- Part 2 relies on `handle_new_user()` having already created a `profiles`
-- row for this user (it fires on the auth.users insert above).

-- ---------------------------------------------------------------------
-- Part 2: business data
-- ---------------------------------------------------------------------

insert into public.companies (id, name, slug, city, phone, country, currency, timezone, default_language, status)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Atlas Rent Car',
  'atlas-rent-car',
  'Marrakech',
  '+212 524-123456',
  'Morocco',
  'MAD',
  'Africa/Casablanca',
  'fr',
  'active'
)
on conflict (id) do nothing;

insert into public.company_memberships (company_id, user_id, role)
values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'owner')
on conflict (company_id, user_id) do nothing;

insert into public.branches (id, company_id, name, city, phone, is_main)
values (
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Main branch — Guéliz',
  'Marrakech',
  '+212 524-123456',
  true
)
on conflict (id) do nothing;

-- Vehicles ---------------------------------------------------------------

insert into public.vehicles (id, company_id, branch_id, registration_number, make, model, year, category, status, daily_rate, odometer_km, seats, insurance_expires_on, registration_expires_on)
values
  ('a0000000-0000-0000-0000-000000001001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '45871-A-6', 'Dacia', 'Logan', 2023, 'economy', 'available', 280, 32100, 5, current_date + interval '4 months', current_date + interval '7 months'),
  ('a0000000-0000-0000-0000-000000001002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '51092-B-6', 'Renault', 'Clio 5', 2023, 'compact', 'rented', 350, 21800, 5, current_date + interval '2 months', current_date + interval '9 months'),
  ('a0000000-0000-0000-0000-000000001003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '48812-E-6', 'Dacia', 'Duster', 2023, 'suv', 'available', 550, 26700, 5, current_date + interval '6 months', current_date + interval '11 months'),
  ('a0000000-0000-0000-0000-000000001004', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '55302-B-6', 'Hyundai', 'Tucson', 2023, 'suv', 'rented', 700, 19300, 5, current_date + interval '1 months', current_date + interval '10 months'),
  ('a0000000-0000-0000-0000-000000001005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '31567-E-6', 'Dacia', 'Duster', 2022, 'suv', 'maintenance', 550, 68900, 5, current_date + interval '3 months', current_date + interval '5 months'),
  ('a0000000-0000-0000-0000-000000001006', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '40213-E-6', 'Mercedes-Benz', 'Vito', 2022, 'van', 'reserved', 900, 39200, 8, current_date + interval '5 months', current_date + interval '8 months')
on conflict (id) do nothing;

-- Customers ----------------------------------------------------------------

insert into public.customers (id, company_id, full_name, phone, email, license_number, license_expires_on)
values
  ('a0000000-0000-0000-0000-000000002001', 'a0000000-0000-0000-0000-000000000001', 'Khadija Idrissi', '+212 661-234567', 'khadija.idrissi@gmail.com', 'MA-118827', current_date + interval '2 years'),
  ('a0000000-0000-0000-0000-000000002002', 'a0000000-0000-0000-0000-000000000001', 'Ahmed Tazi', '+212 662-897431', 'a.tazi@outlook.com', 'MA-204471', current_date + interval '1 years'),
  ('a0000000-0000-0000-0000-000000002003', 'a0000000-0000-0000-0000-000000000001', 'Sara Bennis', '+212 663-551209', null, 'MA-339021', current_date + interval '3 years'),
  ('a0000000-0000-0000-0000-000000002004', 'a0000000-0000-0000-0000-000000000001', 'Mehdi Chraibi', '+212 664-778120', 'mehdi.chraibi@hotmail.com', 'MA-287734', current_date + interval '18 months')
on conflict (id) do nothing;

-- Reservations ---------------------------------------------------------------

insert into public.reservations (id, company_id, branch_id, customer_id, vehicle_id, reference, pickup_at, return_at, pickup_location, return_location, status, source, daily_rate, num_days, total_amount, amount_paid, created_by)
values
  ('a0000000-0000-0000-0000-000000003001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002001', 'a0000000-0000-0000-0000-000000001002', 'RB-1001', now() - interval '2 days', now() + interval '2 days', 'Marrakech Menara Airport', 'Marrakech Menara Airport', 'active', 'whatsapp', 350, 4, 1400, 1000, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000003002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002002', 'a0000000-0000-0000-0000-000000001004', 'RB-1002', now() - interval '1 days', now() + interval '4 days', 'Agency – Guéliz', 'Agency – Guéliz', 'active', 'phone', 700, 5, 3500, 3500, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000003003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002003', 'a0000000-0000-0000-0000-000000001006', 'RB-1003', now() + interval '3 days', now() + interval '6 days', 'Marrakech Menara Airport', 'Marrakech Menara Airport', 'confirmed', 'website', 900, 3, 2700, 900, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000003004', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002004', 'a0000000-0000-0000-0000-000000001003', 'RB-1004', now() + interval '5 days', now() + interval '9 days', 'Agency – Guéliz', 'Agency – Guéliz', 'request', 'walk_in', 550, 4, 2200, 0, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000003005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002001', 'a0000000-0000-0000-0000-000000001001', 'RB-1005', now() - interval '10 days', now() - interval '7 days', 'Agency – Guéliz', 'Agency – Guéliz', 'completed', 'whatsapp', 280, 3, 840, 840, 'a0000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

-- A cancelled reservation and an unassigned (vehicle-less) request, so the
-- reservations list, calendar and overview all have these states to show.
insert into public.reservations (id, company_id, branch_id, customer_id, vehicle_id, requested_category, reference, pickup_at, return_at, pickup_location, return_location, status, source, daily_rate, num_days, total_amount, amount_paid, created_by)
values
  ('a0000000-0000-0000-0000-000000003006', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002002', 'a0000000-0000-0000-0000-000000001001', null, 'RB-1006', now() - interval '20 days', now() - interval '17 days', 'Agency – Guéliz', 'Agency – Guéliz', 'cancelled', 'phone', 280, 3, 840, 0, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000003007', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000002003', null, 'suv', 'RB-1007', now() + interval '8 days', now() + interval '12 days', 'Marrakech Menara Airport', 'Marrakech Menara Airport', 'request', 'website', 600, 4, 2400, 0, 'a0000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

-- Payments (external, recorded manually) --------------------------------------

insert into public.payments (company_id, reservation_id, customer_id, amount, method, paid_at, recorded_by)
values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000003001', 'a0000000-0000-0000-0000-000000002001', 1000, 'cash', now() - interval '2 days', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000003002', 'a0000000-0000-0000-0000-000000002002', 3500, 'card', now() - interval '1 days', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000003003', 'a0000000-0000-0000-0000-000000002003', 900, 'transfer', now() - interval '1 hours', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000003005', 'a0000000-0000-0000-0000-000000002001', 840, 'cash', now() - interval '10 days', 'a0000000-0000-0000-0000-000000000002');

-- Maintenance records ----------------------------------------------------------

insert into public.maintenance_records (company_id, vehicle_id, type, description, status, scheduled_on, cost, supplier, created_by)
values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000001005', 'tire', 'Rear tyre replacement', 'in_progress', current_date, 1200, 'Garage Atlas Pneus', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000001001', 'oil_change', 'Oil and filter change', 'scheduled', current_date + interval '5 days', 350, 'Speedy Marrakech', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000001004', 'insurance_renewal', 'Annual insurance renewal', 'scheduled', current_date + interval '20 days', null, null, 'a0000000-0000-0000-0000-000000000002');

-- Activity log -----------------------------------------------------------------

insert into public.activity_log (company_id, actor_id, type, title, description)
values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'payment_recorded', 'Payment received', 'Ahmed Tazi paid 3,500 MAD in full for RB-1002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'reservation_confirmed', 'Reservation confirmed', 'Mercedes-Benz Vito booked for Sara Bennis, RB-1003'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'customer_created', 'Customer added', 'Mehdi Chraibi added as a new customer'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'vehicle_returned', 'Vehicle returned', 'Dacia Logan (45871-A-6) returned by Khadija Idrissi'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'maintenance_completed', 'Maintenance logged', 'Tyre replacement started for Dacia Duster (31567-E-6)'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'reservation_status_changed', 'Reservation RB-1006 cancelled', 'Ahmed Tazi cancelled his Dacia Logan booking');
