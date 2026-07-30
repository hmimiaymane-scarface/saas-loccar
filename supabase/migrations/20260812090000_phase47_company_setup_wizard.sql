-- Roadmap phase 47 (Company Setup Wizard). Two genuinely new
-- company-level concepts the brief's "default rental rules"/"default
-- deposit" items need — neither existed anywhere before this phase
-- (deposit amount was a fully manual, per-reservation entry with no
-- company-level default to seed it from; overdue detection was a
-- strict `return_at < now` with no grace period anywhere).
--
-- `logo_path`, `email`, `address` already exist as dormant columns on
-- `companies` since its original migration — this phase is their
-- first real reader/writer, not a new column.
alter table public.companies
  add column default_deposit_mad numeric,
  add column overdue_grace_period_hours integer not null default 0
    check (overdue_grace_period_hours >= 0 and overdue_grace_period_hours <= 168);
