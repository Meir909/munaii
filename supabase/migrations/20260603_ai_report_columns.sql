-- AI report fields + operator can update own wells on map
alter table public.reports
  add column if not exists ai_generated boolean not null default false,
  add column if not exists ai_confidence integer not null default 0
    check (ai_confidence between 0 and 100);

drop policy if exists "wells_update_operator_own" on public.wells;
create policy "wells_update_operator_own"
on public.wells for update
to authenticated
using (operator_id = auth.uid())
with check (operator_id = auth.uid());
