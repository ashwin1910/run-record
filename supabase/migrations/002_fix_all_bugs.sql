-- ═══════════════════════════════════════════════════════════
-- Run-Record Bug Fix Migration
-- Run this ONCE in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════

-- FIX 1: Profile trigger needs to bypass RLS to insert profiles on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- FIX 2: Add INSERT policy for profiles (the trigger runs as definer but still needs this)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow profile creation' and tablename = 'profiles') then
    execute 'create policy "Allow profile creation" on profiles for insert with check (true)';
  end if;
end $$;

-- FIX 3: Add DELETE policies (for the delete run feature)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own runs' and tablename = 'run_sessions') then
    execute 'create policy "Users can delete own runs" on run_sessions for delete using (auth.uid() = user_id)';
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own run entries' and tablename = 'run_entries') then
    execute 'create policy "Users can delete own run entries" on run_entries for delete using (exists (select 1 from run_sessions where run_sessions.id = run_entries.run_id and run_sessions.user_id = auth.uid()))';
  end if;
end $$;

-- FIX 4: Retroactively create profiles for users who signed up but hit the trigger error
insert into public.profiles (id, email)
select id, email from auth.users
where id not in (select id from public.profiles)
on conflict do nothing;

-- FIX 5: Update Supabase Auth redirect URL
-- !! YOU MUST ALSO DO THIS MANUALLY !!
-- Go to: Supabase Dashboard > Authentication > URL Configuration
-- Change "Site URL" to your Vercel URL (e.g. https://run-record.vercel.app)
-- Add your Vercel URL to "Redirect URLs" as well
