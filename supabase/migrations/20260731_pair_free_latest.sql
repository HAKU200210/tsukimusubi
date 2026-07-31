-- 月結び｜はく × りさ
-- 既存の二人版データを残したまま、最新版の無料機能を追加します。
-- Supabase SQL Editor で一度だけ実行してください。再実行しても安全です。

create extension if not exists pgcrypto with schema extensions;

alter table public.monthly_reviews
  add column if not exists question_pack text not null default 'standard',
  add column if not exists extra_answers jsonb not null default '{}'::jsonb;

alter table public.monthly_reviews drop constraint if exists monthly_reviews_question_pack_check;
alter table public.monthly_reviews add constraint monthly_reviews_question_pack_check
  check (question_pack in ('standard','future','closeness','repair'));

alter table public.monthly_reviews drop constraint if exists monthly_reviews_extra_answers_check;
alter table public.monthly_reviews add constraint monthly_reviews_extra_answers_check
  check (jsonb_typeof(extra_answers) = 'object' and char_length(extra_answers::text) <= 4000);

create table if not exists public.pair_free_anniversaries (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 50),
  event_date date not null,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pair_free_date_records (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  date_on date not null,
  title text not null check (char_length(trim(title)) between 1 and 60),
  place text not null default '' check (char_length(place) <= 80),
  memory text not null default '' check (char_length(memory) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pair_free_date_wishes (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 60),
  place text not null default '' check (char_length(place) <= 80),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'planned' check (status in ('planned','done')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pair_free_anniversaries_couple_date_idx
  on public.pair_free_anniversaries(couple_id,event_date);
create index if not exists pair_free_date_records_couple_date_idx
  on public.pair_free_date_records(couple_id,date_on desc);
create index if not exists pair_free_date_wishes_couple_status_idx
  on public.pair_free_date_wishes(couple_id,status,created_at desc);

alter table public.pair_free_anniversaries enable row level security;
alter table public.pair_free_date_records enable row level security;
alter table public.pair_free_date_wishes enable row level security;

drop policy if exists "pair free members read anniversaries" on public.pair_free_anniversaries;
create policy "pair free members read anniversaries"
on public.pair_free_anniversaries for select to authenticated
using (public.is_couple_member(couple_id));
drop policy if exists "pair free members add anniversaries" on public.pair_free_anniversaries;
create policy "pair free members add anniversaries"
on public.pair_free_anniversaries for insert to authenticated
with check (public.is_couple_member(couple_id) and created_by = auth.uid());
drop policy if exists "pair free members delete anniversaries" on public.pair_free_anniversaries;
create policy "pair free members delete anniversaries"
on public.pair_free_anniversaries for delete to authenticated
using (public.is_couple_member(couple_id));

drop policy if exists "pair free members read date records" on public.pair_free_date_records;
create policy "pair free members read date records"
on public.pair_free_date_records for select to authenticated
using (public.is_couple_member(couple_id));
drop policy if exists "pair free members add date records" on public.pair_free_date_records;
create policy "pair free members add date records"
on public.pair_free_date_records for insert to authenticated
with check (public.is_couple_member(couple_id) and created_by = auth.uid());
drop policy if exists "pair free members delete date records" on public.pair_free_date_records;
create policy "pair free members delete date records"
on public.pair_free_date_records for delete to authenticated
using (public.is_couple_member(couple_id));

drop policy if exists "pair free members read date wishes" on public.pair_free_date_wishes;
create policy "pair free members read date wishes"
on public.pair_free_date_wishes for select to authenticated
using (public.is_couple_member(couple_id));
drop policy if exists "pair free members add date wishes" on public.pair_free_date_wishes;
create policy "pair free members add date wishes"
on public.pair_free_date_wishes for insert to authenticated
with check (public.is_couple_member(couple_id) and created_by = auth.uid());
drop policy if exists "pair free members update date wishes" on public.pair_free_date_wishes;
create policy "pair free members update date wishes"
on public.pair_free_date_wishes for update to authenticated
using (public.is_couple_member(couple_id))
with check (public.is_couple_member(couple_id));
drop policy if exists "pair free members delete date wishes" on public.pair_free_date_wishes;
create policy "pair free members delete date wishes"
on public.pair_free_date_wishes for delete to authenticated
using (public.is_couple_member(couple_id));

create or replace function public.pair_free_get_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_member public.couple_members;
  v_pair public.couples;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_member from public.couple_members where user_id = v_user limit 1;
  if v_member.user_id is null then return null; end if;
  select * into v_pair from public.couples where id = v_member.couple_id;
  return jsonb_build_object(
    'pair', jsonb_build_object(
      'id', v_pair.id,
      'name_a', 'はく',
      'initial_a', '白',
      'name_b', 'りさ',
      'initial_b', '凜',
      'met_date', v_pair.met_on,
      'dating_date', v_pair.dating_on,
      'created_at', v_pair.created_at
    ),
    'membership', jsonb_build_object(
      'role', case when v_member.role = 'haku' then 'a' else 'b' end,
      'display_name', case when v_member.role = 'haku' then 'はく' else 'りさ' end,
      'avatar_initial', case when v_member.role = 'haku' then '白' else '凜' end
    ),
    'members', jsonb_build_array(
      jsonb_build_object('role','a','display_name','はく','avatar_initial','白'),
      jsonb_build_object('role','b','display_name','りさ','avatar_initial','凜')
    ),
    'role', case when v_member.role = 'haku' then 'a' else 'b' end,
    'entitlement', jsonb_build_object('tier','pair_free','is_plus',true,'expires_at',null),
    'limits', jsonb_build_object(
      'photos',500,'anniversaries',500,'date_records',1000,'date_wishes',1000
    )
  );
end;
$$;

create or replace function public.pair_free_submit_monthly_review(
  p_month date,
  p_scores jsonb,
  p_grateful text,
  p_happy text,
  p_difficult text,
  p_hope text,
  p_self_change text,
  p_renew text,
  p_question_pack text default 'standard',
  p_extra_answers jsonb default '{}'::jsonb
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
begin
  select couple_id, role into v_couple_id, v_role
  from public.couple_members where user_id = auth.uid();
  if v_couple_id is null then raise exception 'Device is not paired'; end if;
  if p_month <> date_trunc('month',p_month)::date then raise exception 'Invalid month'; end if;
  foreach v_key in array array['communication','trust','care','time','support','affection'] loop
    if not (p_scores ? v_key) or (p_scores->>v_key)::int not between 1 and 10 then
      raise exception 'Invalid score';
    end if;
  end loop;
  if p_renew not in ('continue','improve','talk','end') then raise exception 'Invalid renewal choice'; end if;
  if p_question_pack not in ('standard','future','closeness','repair') then raise exception 'Invalid question pack'; end if;
  if jsonb_typeof(coalesce(p_extra_answers,'{}'::jsonb)) <> 'object'
     or char_length(coalesce(p_extra_answers,'{}'::jsonb)::text) > 4000 then
    raise exception 'Invalid extra answers';
  end if;
  if least(
    length(trim(p_grateful)),length(trim(p_happy)),length(trim(p_difficult)),
    length(trim(p_hope)),length(trim(p_self_change))
  ) = 0 then raise exception 'All reflection fields are required'; end if;

  insert into public.monthly_reviews(
    couple_id,month,author_id,author_role,scores,grateful,happy,hurt,hope,self_change,
    renew,question_pack,extra_answers
  ) values(
    v_couple_id,p_month,auth.uid(),v_role,p_scores,trim(p_grateful),trim(p_happy),
    trim(p_difficult),trim(p_hope),trim(p_self_change),p_renew,p_question_pack,
    coalesce(p_extra_answers,'{}'::jsonb)
  ) returning id into v_review_id;
  return v_review_id;
end;
$$;

create or replace function public.pair_free_rotate_partner_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid;
  v_role text;
begin
  select couple_id,role into v_couple,v_role
  from public.couple_members where user_id = auth.uid();
  if v_couple is null or v_role <> 'haku' then raise exception 'Only Haku can renew the invitation code'; end if;
  if char_length(public.normalize_access_code(p_code)) < 16 then raise exception 'Invalid access code'; end if;
  update public.couple_access_codes
  set code_hash = public.access_code_hash(p_code), created_at = now()
  where couple_id = v_couple and role = 'risa';
end;
$$;

create or replace function public.pair_free_rotate_my_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid;
  v_role text;
begin
  select couple_id,role into v_couple,v_role
  from public.couple_members where user_id = auth.uid();
  if v_couple is null then raise exception 'Device is not paired'; end if;
  if char_length(public.normalize_access_code(p_code)) < 16 then raise exception 'Invalid access code'; end if;
  update public.couple_access_codes
  set code_hash = public.access_code_hash(p_code), created_at = now()
  where couple_id = v_couple and role = v_role;
end;
$$;

revoke all on public.pair_free_anniversaries,public.pair_free_date_records,public.pair_free_date_wishes from anon;
grant select,insert,delete on public.pair_free_anniversaries,public.pair_free_date_records to authenticated;
grant select,insert,update,delete on public.pair_free_date_wishes to authenticated;

revoke all on function public.pair_free_get_context() from public,anon;
revoke all on function public.pair_free_submit_monthly_review(date,jsonb,text,text,text,text,text,text,text,jsonb) from public,anon;
revoke all on function public.pair_free_rotate_partner_code(text) from public,anon;
revoke all on function public.pair_free_rotate_my_code(text) from public,anon;
grant execute on function public.pair_free_get_context() to authenticated;
grant execute on function public.pair_free_submit_monthly_review(date,jsonb,text,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.pair_free_rotate_partner_code(text) to authenticated;
grant execute on function public.pair_free_rotate_my_code(text) to authenticated;
