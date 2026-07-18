-- Shared trigger function that keeps `updated_at` current on every table
-- that has one. Applied per-table in each migration below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
