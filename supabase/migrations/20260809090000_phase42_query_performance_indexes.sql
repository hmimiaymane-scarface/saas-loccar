-- Roadmap phase 42 (Database Query and Index Pass). Cross-referenced
-- every named review area (reservation queries, calendar ranges,
-- customer/plate/document search, activity timelines, notification
-- feed, Operations Feed observers, reporting) against the actual
-- Supabase-js query code and every existing `create index` statement
-- across prior migrations. Most areas were already properly indexed
-- (see docs/query-performance-pass.md for the full audit, including
-- what was found already fine and left alone); this migration adds
-- only the confirmed real gaps.

-- 1. Leading-wildcard `ilike('%q%')` search columns had no index at
-- all -- a plain btree can't help a %contains% predicate regardless of
-- how it's built. pg_trgm is a standard Postgres contrib extension
-- (bundled with Supabase), enabling a GIN trigram index that actually
-- can. Scoped to exactly the three columns this phase's named review
-- areas call out (customer search, plate search, reservation
-- search/reference) -- not every ilike column in the app (e.g.
-- vehicles.make/model, contracts.contract_number are lower-value,
-- lower-cardinality columns ilike already handles cheaply enough).
create extension if not exists pg_trgm;

create index customers_full_name_trgm_idx
  on public.customers using gin (full_name gin_trgm_ops);

create index vehicles_registration_number_trgm_idx
  on public.vehicles using gin (registration_number gin_trgm_ops);

create index reservations_reference_trgm_idx
  on public.reservations using gin (reference gin_trgm_ops);

-- 2. `getActivityLogList`'s `metadata->>'reservation_id'`/`'vehicle_id'`
-- filters and `getCustomerTimeline`'s `metadata->>'customer_id'`/
-- `'reservation_id'` filters (lib/data.ts) had zero index support --
-- every vehicle/customer/reservation timeline fetch fell through to a
-- company_id-prefix scan plus a per-row JSON-text comparison. Partial
-- (WHERE ... IS NOT NULL) since most activity_log rows don't carry
-- every one of these keys.
create index activity_log_metadata_reservation_id_idx
  on public.activity_log ((metadata ->> 'reservation_id'))
  where metadata ->> 'reservation_id' is not null;

create index activity_log_metadata_vehicle_id_idx
  on public.activity_log ((metadata ->> 'vehicle_id'))
  where metadata ->> 'vehicle_id' is not null;

create index activity_log_metadata_customer_id_idx
  on public.activity_log ((metadata ->> 'customer_id'))
  where metadata ->> 'customer_id' is not null;

-- 3. Notification feed (`getStoredNotificationEvents`) filters
-- company_id + user_id + key is null, ordered by created_at desc --
-- previously only a company_id-only index and a differently-shaped
-- partial (user_id, read_at) index (for the unread badge count, a
-- separate query) existed; neither covers this one's actual shape.
create index notifications_company_user_created_idx
  on public.notifications (company_id, user_id, created_at desc);

-- 4. Calendar's maintenance-block range query (`getCalendarMaintenanceBlocks`)
-- filters company_id + status + a scheduled_on date range -- the
-- existing (company_id, status) index doesn't carry scheduled_on, so
-- the range bound couldn't be applied inside the index scan.
create index maintenance_records_company_status_scheduled_idx
  on public.maintenance_records (company_id, status, scheduled_on);

-- 5. Document search's initial fetch (`searchDocumentIdsByExtractedFields`)
-- filters company_id + status = 'completed' before falling through to
-- in-app JSON text matching over `fields` (a deliberate, documented
-- scope call from phase 04 -- see lib/documents.ts's own comment --
-- not something this phase revisits). The existing
-- (company_id, document_id, created_at) index doesn't carry status;
-- this lets the filter itself use an index instead of a full scan of
-- the company's extraction history before the JS-side matching starts.
create index document_extractions_company_status_idx
  on public.document_extractions (company_id, status);
