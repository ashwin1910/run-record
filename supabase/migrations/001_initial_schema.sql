-- Run-Record Database Schema
-- Run this in the Supabase SQL Editor

-- ── Profiles ──
-- Linked to Supabase Auth users
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  preferences jsonb default '{}',
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Run Sessions ──
create table if not exists run_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  summary text,
  topics text[],
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz default now()
);

create index if not exists idx_run_sessions_user_date on run_sessions(user_id, started_at desc);

-- ── Run Entries ──
-- Unified table for transcript messages and captured notes
create table if not exists run_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references run_sessions(id) on delete cascade,
  entry_type text not null check (entry_type in ('transcript_user', 'transcript_assistant', 'note')),
  content text not null,
  note_type text check (note_type in ('insight', 'note', 'essay_fragment', 'question') or note_type is null),
  tags text[],
  timestamp_in_run integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_run_entries_run on run_entries(run_id, created_at);

-- ── Row Level Security ──
alter table profiles enable row level security;
alter table run_sessions enable row level security;
alter table run_entries enable row level security;

-- Profiles: users can only see/edit their own
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Run sessions: users can only access their own
create policy "Users can view own runs"
  on run_sessions for select using (auth.uid() = user_id);
create policy "Users can create own runs"
  on run_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own runs"
  on run_sessions for update using (auth.uid() = user_id);

-- Run entries: users can access entries for their own runs
create policy "Users can view own run entries"
  on run_entries for select using (
    exists (select 1 from run_sessions where run_sessions.id = run_entries.run_id and run_sessions.user_id = auth.uid())
  );
create policy "Users can create entries for own runs"
  on run_entries for insert with check (
    exists (select 1 from run_sessions where run_sessions.id = run_entries.run_id and run_sessions.user_id = auth.uid())
  );
