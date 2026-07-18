-- One profile row per Supabase auth user. Created automatically on signup
-- via the trigger below, never by the client.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_path text,
  phone text,
  preferred_language text not null default 'fr'
    check (preferred_language in ('fr', 'ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row whenever a new Supabase auth user is created.
-- SECURITY DEFINER so it can write to public.profiles despite RLS; the
-- function body is fixed (no client input beyond the new user's own id/
-- metadata), so this cannot be used to write arbitrary rows.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
