-- AI assistant: conversations, messages, and proposed actions.
--
-- Critical design property: this feature adds no new privilege. Every
-- write the AI can cause still goes through the exact same server
-- action (createReservation, recordPayment, etc.) with the exact same
-- requireSession()/requireRole() checks and RLS as a human clicking the
-- same button — the AI only ever *proposes* a write by inserting a row
-- here (which a human must explicitly confirm), it never writes to any
-- operational table directly. If a driver asks the assistant to create
-- a reservation, confirming the proposal fails the same way a driver
-- manually submitting the reservation form would.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  provider text not null default 'anthropic' check (provider in ('openai', 'anthropic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create index ai_conversations_user_id_idx on public.ai_conversations (user_id, updated_at desc);
create index ai_conversations_company_id_idx on public.ai_conversations (company_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  tool_name text,
  tool_result jsonb,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_id_idx on public.ai_messages (conversation_id, created_at);

-- One row per action the assistant ever proposed, whether or not a
-- human went on to confirm it — the audit trail of what the AI wanted
-- to do, separate from what actually happened (result_id / the real
-- table's own row is the source of truth for the latter).
create table public.ai_proposed_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  message_id uuid references public.ai_messages (id) on delete set null,
  action_type text not null check (action_type in (
    'create_reservation',
    'record_payment',
    'cancel_reservation',
    'schedule_maintenance'
  )),
  summary text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  result_id uuid
);

create index ai_proposed_actions_conversation_id_idx on public.ai_proposed_actions (conversation_id);
create index ai_proposed_actions_company_id_idx on public.ai_proposed_actions (company_id, status);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_proposed_actions enable row level security;

-- A conversation is private to the person having it. Owners/managers get
-- read-only oversight (not write) — this is a business tool, not a
-- personal diary, but only the person chatting can steer it or resolve
-- its proposals.
create policy "Users manage their own AI conversations"
  on public.ai_conversations for all
  using (user_id = auth.uid() and public.is_company_member(company_id))
  with check (user_id = auth.uid() and public.is_company_member(company_id));

create policy "Managers can view company AI conversations"
  on public.ai_conversations for select
  using (public.is_company_manager_or_owner(company_id));

create policy "Users manage messages in their own conversations"
  on public.ai_messages for all
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
  ));

create policy "Managers can view company AI messages"
  on public.ai_messages for select
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and public.is_company_manager_or_owner(c.company_id)
  ));

create policy "Users manage their own proposed actions"
  on public.ai_proposed_actions for all
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_proposed_actions.conversation_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_proposed_actions.conversation_id and c.user_id = auth.uid()
  ));

create policy "Managers can view company proposed actions"
  on public.ai_proposed_actions for select
  using (public.is_company_manager_or_owner(company_id));
