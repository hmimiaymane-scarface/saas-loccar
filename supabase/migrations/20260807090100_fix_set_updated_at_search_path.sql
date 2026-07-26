-- Found via `supabase db advisors --linked` (productization wave 1
-- phase 5's live-project verification pass): `set_updated_at()` was the
-- only function in the whole schema without a pinned `search_path` —
-- every other function already follows the "SECURITY DEFINER / stable /
-- search_path-pinned" convention documented throughout these migrations
-- (see e.g. has_permission()). Low actual exploitability here (the body
-- only calls the built-in `now()`), but pinning it costs nothing and
-- removes the one outlier the linter flagged.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
