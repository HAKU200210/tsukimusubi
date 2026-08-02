-- Allow a member to revise only their own sealed review until the partner submits.
create or replace function public.pair_free_update_monthly_review(
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
  if exists (
    select 1 from public.monthly_reviews
    where couple_id = v_couple_id and month = p_month and author_role <> v_role
  ) then raise exception 'Both reviews are already submitted'; end if;
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

  update public.monthly_reviews
  set scores = p_scores,
      grateful = trim(p_grateful),
      happy = trim(p_happy),
      hurt = trim(p_difficult),
      hope = trim(p_hope),
      self_change = trim(p_self_change),
      renew = p_renew,
      question_pack = p_question_pack,
      extra_answers = coalesce(p_extra_answers,'{}'::jsonb),
      submitted_at = now()
  where couple_id = v_couple_id
    and month = p_month
    and author_id = auth.uid()
    and author_role = v_role
  returning id into v_review_id;
  if v_review_id is null then raise exception 'No submitted review'; end if;
  return v_review_id;
end;
$$;

revoke all on function public.pair_free_update_monthly_review(date,jsonb,text,text,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.pair_free_update_monthly_review(date,jsonb,text,text,text,text,text,text,text,jsonb) to authenticated;
