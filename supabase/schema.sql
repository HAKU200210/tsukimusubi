-- Tsukimusubi cloud schema
-- Run once in Supabase SQL Editor. It is safe to run again after an interrupted setup.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.couples (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null default '月結び｜はく × りさ',
  met_on date not null default date '2026-06-05',
  dating_on date not null default date '2026-07-07',
  created_at timestamptz not null default now()
);

create table if not exists public.couple_access_codes (
  couple_id uuid not null references public.couples(id) on delete cascade,
  role text not null check (role in ('haku', 'risa')),
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  primary key (couple_id, role)
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('haku', 'risa')),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id)
);

create table if not exists public.monthly_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('haku', 'risa')),
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  grateful text not null,
  happy text not null,
  hurt text not null,
  hope text not null,
  self_change text not null,
  renew text not null check (renew in ('continue', 'improve', 'talk', 'end')),
  submitted_at timestamptz not null default now(),
  unique (couple_id, month, author_role)
);

create table if not exists public.album_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  uploader_role text not null check (uploader_role in ('haku', 'risa')),
  storage_path text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create or replace function public.normalize_access_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.access_code_hash(p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(public.normalize_access_code(p_code), 'sha256'), 'hex');
$$;

create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = p_couple_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.member_role(p_couple_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.couple_members
  where couple_id = p_couple_id and user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.both_reviews_submitted(p_couple_id uuid, p_month date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_couple_member(p_couple_id) and count(distinct author_role) = 2
  from public.monthly_reviews
  where couple_id = p_couple_id and month = p_month;
$$;

alter table public.couples enable row level security;
alter table public.couple_access_codes enable row level security;
alter table public.couple_members enable row level security;
alter table public.monthly_reviews enable row level security;
alter table public.album_photos enable row level security;

drop policy if exists "members read their couple" on public.couples;
create policy "members read their couple"
on public.couples for select to authenticated
using (public.is_couple_member(id));

drop policy if exists "members read their membership" on public.couple_members;
create policy "members read their membership"
on public.couple_members for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "sealed reviews stay private until both submit" on public.monthly_reviews;
create policy "sealed reviews stay private until both submit"
on public.monthly_reviews for select to authenticated
using (
  public.is_couple_member(couple_id)
  and (
    author_role = public.member_role(couple_id)
    or public.both_reviews_submitted(couple_id, month)
  )
);

drop policy if exists "members read album metadata" on public.album_photos;
create policy "members read album metadata"
on public.album_photos for select to authenticated
using (public.is_couple_member(couple_id));

drop policy if exists "members add album metadata" on public.album_photos;
create policy "members add album metadata"
on public.album_photos for insert to authenticated
with check (
  public.is_couple_member(couple_id)
  and uploader_id = (select auth.uid())
  and uploader_role = public.member_role(couple_id)
);

drop policy if exists "members delete album metadata" on public.album_photos;
create policy "members delete album metadata"
on public.album_photos for delete to authenticated
using (public.is_couple_member(couple_id));

create or replace function public.create_couple(p_haku_code text, p_risa_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_couple_id uuid;
  v_user_id uuid := auth.uid();
  v_haku text := public.normalize_access_code(p_haku_code);
  v_risa text := public.normalize_access_code(p_risa_code);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if length(v_haku) < 16 or length(v_risa) < 16 then raise exception 'Access codes must contain at least 16 characters'; end if;
  if v_haku = v_risa then raise exception 'Access codes must be different'; end if;
  if exists (select 1 from public.couple_members where user_id = v_user_id) then raise exception 'This device is already paired'; end if;

  insert into public.couples default values returning id into v_couple_id;
  insert into public.couple_access_codes(couple_id, role, code_hash) values
    (v_couple_id, 'haku', public.access_code_hash(v_haku)),
    (v_couple_id, 'risa', public.access_code_hash(v_risa));
  insert into public.couple_members(couple_id, user_id, role)
    values (v_couple_id, v_user_id, 'haku');
  return v_couple_id;
end;
$$;

create or replace function public.join_couple(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_couple_id uuid;
  v_role text;
  v_user_id uuid := auth.uid();
  v_existing uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select couple_id into v_existing from public.couple_members where user_id = v_user_id;
  if v_existing is not null then return v_existing; end if;

  select couple_id, role into v_couple_id, v_role
  from public.couple_access_codes
  where code_hash = public.access_code_hash(p_code);
  if v_couple_id is null then raise exception 'Invalid pairing code'; end if;

  insert into public.couple_members(couple_id, user_id, role)
    values (v_couple_id, v_user_id, v_role);
  return v_couple_id;
end;
$$;

create or replace function public.get_month_status(p_month date)
returns table(haku_submitted boolean, risa_submitted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  select couple_id into v_couple_id from public.couple_members where user_id = auth.uid();
  if v_couple_id is null then raise exception 'Device is not paired'; end if;
  return query select
    exists(select 1 from public.monthly_reviews where couple_id = v_couple_id and month = p_month and author_role = 'haku'),
    exists(select 1 from public.monthly_reviews where couple_id = v_couple_id and month = p_month and author_role = 'risa');
end;
$$;

create or replace function public.submit_monthly_review(
  p_month date,
  p_scores jsonb,
  p_grateful text,
  p_happy text,
  p_hurt text,
  p_hope text,
  p_self_change text,
  p_renew text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_role text;
  v_review_id uuid;
  v_key text;
  v_value text;
begin
  select couple_id, role into v_couple_id, v_role
  from public.couple_members where user_id = auth.uid();
  if v_couple_id is null then raise exception 'Device is not paired'; end if;
  if p_month <> date_trunc('month', p_month)::date then raise exception 'Month must be the first day of a month'; end if;
  if jsonb_typeof(p_scores) <> 'object' or (select count(*) from jsonb_object_keys(p_scores)) <> 6 then
    raise exception 'Exactly six scores are required';
  end if;
  for v_key, v_value in select key, value from jsonb_each_text(p_scores) loop
    if not (v_key = any(array['security','communication','company','trust','romance','overall']))
       or v_value !~ '^[0-9]+$' or v_value::int < 1 or v_value::int > 10 then
      raise exception 'Scores must use the six approved categories and values from 1 to 10';
    end if;
  end loop;
  if p_renew not in ('continue','improve','talk','end') then raise exception 'Invalid renewal choice'; end if;
  if least(length(trim(p_grateful)), length(trim(p_happy)), length(trim(p_hurt)), length(trim(p_hope)), length(trim(p_self_change))) = 0 then
    raise exception 'All reflection fields are required';
  end if;

  insert into public.monthly_reviews(
    couple_id, month, author_id, author_role, scores, grateful, happy, hurt, hope, self_change, renew
  ) values (
    v_couple_id, p_month, auth.uid(), v_role, p_scores, trim(p_grateful), trim(p_happy), trim(p_hurt), trim(p_hope), trim(p_self_change), p_renew
  ) returning id into v_review_id;
  return v_review_id;
end;
$$;

create or replace function public.reset_month_for_testing(p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_role text;
begin
  select couple_id, role into v_couple_id, v_role
  from public.couple_members where user_id = auth.uid();
  if v_couple_id is null or v_role <> 'haku' then raise exception 'Only Haku can reset a test month'; end if;
  delete from public.monthly_reviews where couple_id = v_couple_id and month = p_month;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('couple-album', 'couple-album', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "couple members read album files" on storage.objects;
create policy "couple members read album files"
on storage.objects for select to authenticated
using (
  bucket_id = 'couple-album'
  and exists (
    select 1 from public.couple_members
    where user_id = (select auth.uid())
      and couple_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "couple members upload album files" on storage.objects;
create policy "couple members upload album files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'couple-album'
  and exists (
    select 1 from public.couple_members
    where user_id = (select auth.uid())
      and couple_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "couple members delete album files" on storage.objects;
create policy "couple members delete album files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'couple-album'
  and exists (
    select 1 from public.couple_members
    where user_id = (select auth.uid())
      and couple_id::text = (storage.foldername(name))[1]
  )
);

revoke all on public.couples, public.couple_access_codes, public.couple_members, public.monthly_reviews, public.album_photos from anon;
revoke all on public.couple_access_codes from authenticated;
grant select on public.couples, public.couple_members, public.monthly_reviews, public.album_photos to authenticated;
grant insert, delete on public.album_photos to authenticated;

revoke all on function public.create_couple(text, text) from public, anon;
revoke all on function public.join_couple(text) from public, anon;
revoke all on function public.get_month_status(date) from public, anon;
revoke all on function public.submit_monthly_review(date, jsonb, text, text, text, text, text, text) from public, anon;
revoke all on function public.reset_month_for_testing(date) from public, anon;
revoke all on function public.is_couple_member(uuid) from public, anon;
revoke all on function public.member_role(uuid) from public, anon;
revoke all on function public.both_reviews_submitted(uuid, date) from public, anon;
grant execute on function public.create_couple(text, text) to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.get_month_status(date) to authenticated;
grant execute on function public.submit_monthly_review(date, jsonb, text, text, text, text, text, text) to authenticated;
grant execute on function public.reset_month_for_testing(date) to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.member_role(uuid) to authenticated;
grant execute on function public.both_reviews_submitted(uuid, date) to authenticated;
