-- CareerLaunch SA structural upgrade applied to production on 2026-10-02.

alter table public.profiles
  add column if not exists alternative_phone text,
  add column if not exists address_text text,
  add column if not exists availability text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists "references" jsonb not null default '[]'::jsonb,
  add column if not exists cv_builder_state jsonb not null default '{}'::jsonb;

alter table public.candidate_education
  add column if not exists subjects text[] not null default '{}';

create table if not exists public.shortlisted_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

alter table public.shortlisted_opportunities enable row level security;

drop policy if exists shortlist_select_own on public.shortlisted_opportunities;
create policy shortlist_select_own on public.shortlisted_opportunities
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists shortlist_insert_own on public.shortlisted_opportunities;
create policy shortlist_insert_own on public.shortlisted_opportunities
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists shortlist_delete_own on public.shortlisted_opportunities;
create policy shortlist_delete_own on public.shortlisted_opportunities
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.shortlisted_opportunities to authenticated;

create or replace function public.enforce_shortlist_limit()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if (
    select count(*)
    from public.shortlisted_opportunities s
    where s.user_id = new.user_id
  ) >= 5 then
    raise exception 'CareerLaunch shortlist limit is five opportunities.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_shortlist_limit() from public, anon, authenticated;

drop trigger if exists enforce_shortlist_limit_before_insert on public.shortlisted_opportunities;
create trigger enforce_shortlist_limit_before_insert
before insert on public.shortlisted_opportunities
for each row execute function public.enforce_shortlist_limit();

create table if not exists public.cv_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cv_drafts enable row level security;

drop policy if exists cv_drafts_select_own on public.cv_drafts;
create policy cv_drafts_select_own on public.cv_drafts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists cv_drafts_insert_own on public.cv_drafts;
create policy cv_drafts_insert_own on public.cv_drafts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists cv_drafts_update_own on public.cv_drafts;
create policy cv_drafts_update_own on public.cv_drafts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists cv_drafts_delete_own on public.cv_drafts;
create policy cv_drafts_delete_own on public.cv_drafts
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.cv_drafts to authenticated;

create index if not exists shortlisted_opportunities_opportunity_idx
  on public.shortlisted_opportunities(opportunity_id);
create index if not exists shortlisted_opportunities_user_created_idx
  on public.shortlisted_opportunities(user_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-documents',
  'candidate-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "candidate_documents_select_own" on storage.objects;
create policy "candidate_documents_select_own" on storage.objects
for select to authenticated
using (
  bucket_id='candidate-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "candidate_documents_insert_own" on storage.objects;
create policy "candidate_documents_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id='candidate-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "candidate_documents_update_own" on storage.objects;
create policy "candidate_documents_update_own" on storage.objects
for update to authenticated
using (
  bucket_id='candidate-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='candidate-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "candidate_documents_delete_own" on storage.objects;
create policy "candidate_documents_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id='candidate-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create extension if not exists pg_cron with schema pg_catalog;

-- Production schedule: 04:05 UTC daily (06:05 South Africa).
-- Existing deployment unschedules the prior job before recreating it.
