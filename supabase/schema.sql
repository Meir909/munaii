create extension if not exists postgis;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null unique,
  role text not null default 'operator' check (role in ('operator', 'manager', 'director', 'admin')),
  position text not null default '',
  region text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wells (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'warning', 'inactive', 'broken')),
  product text not null default 'oil' check (product in ('oil', 'gas', 'condensate')),
  "production24h" numeric not null default 0,
  temperature numeric not null default 0,
  tubing_internal_p numeric not null default 0,
  tubing_external_p numeric not null default 0,
  annulus_p numeric not null default 0,
  pump_strokes integer not null default 0,
  lat double precision not null default 43.65,
  lng double precision not null default 52.88,
  gis_point geography(point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  operator_id uuid references public.profiles(id) on delete set null,
  manager_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.wells(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'flagged', 'rejected')),
  ai_score integer not null default 0 check (ai_score between 0 and 100),
  ai_confidence integer not null default 0 check (ai_confidence between 0 and 100),
  ai_generated boolean not null default false,
  summary text not null default '',
  flag text,
  temperature numeric,
  "production24h" numeric,
  tubing_internal_p numeric,
  tubing_external_p numeric,
  annulus_p numeric,
  pump_strokes integer,
  comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null default '',
  file_size bigint not null default 0,
  public_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  icon text not null default 'info',
  title text not null,
  body text not null default '',
  tone text not null default 'info' check (tone in ('warning', 'success', 'info', 'destructive')),
  unread boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  event_type text not null default 'Событие',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  who text not null,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

create index if not exists wells_gis_point_idx on public.wells using gist (gis_point);
create index if not exists wells_status_idx on public.wells (status);
create index if not exists reports_well_id_idx on public.reports (well_id);
create index if not exists reports_operator_id_idx on public.reports (operator_id);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists report_files_report_id_idx on public.report_files (report_id);

alter table public.profiles enable row level security;
alter table public.wells enable row level security;
alter table public.reports enable row level security;
alter table public.report_files enable row level security;
alter table public.notifications enable row level security;
alter table public.calendar_events enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_staff()
returns boolean
stable
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('manager', 'director', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
stable
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'
  );
$$;

create or replace function public.is_director_or_admin()
returns boolean
stable
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('director', 'admin')
  );
$$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, position, region, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), ''),
    coalesce(new.email, ''),
    case
      when new.raw_user_meta_data->>'role' in ('operator', 'manager', 'director', 'admin')
        then new.raw_user_meta_data->>'role'
      else 'operator'
    end,
    coalesce(new.raw_user_meta_data->>'position', ''),
    coalesce(new.raw_user_meta_data->>'region', ''),
    true
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    position = excluded.position,
    region = excluded.region,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists wells_set_updated_at on public.wells;
create trigger wells_set_updated_at
before update on public.wells
for each row execute function public.set_updated_at();

drop policy if exists "profiles_select_self_or_staff" on public.profiles;
create policy "profiles_select_self_or_staff"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.is_staff());

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
create policy "profiles_insert_own_or_admin"
on public.profiles for insert
to authenticated
with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "wells_select_authenticated" on public.wells;
create policy "wells_select_authenticated"
on public.wells for select
to authenticated
using (true);

drop policy if exists "wells_insert_staff" on public.wells;
create policy "wells_insert_staff"
on public.wells for insert
to authenticated
with check (public.is_staff());

drop policy if exists "wells_update_staff" on public.wells;
create policy "wells_update_staff"
on public.wells for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "wells_delete_director_admin" on public.wells;
create policy "wells_delete_director_admin"
on public.wells for delete
to authenticated
using (public.is_director_or_admin());

drop policy if exists "reports_select_owner_or_staff" on public.reports;
create policy "reports_select_owner_or_staff"
on public.reports for select
to authenticated
using (operator_id = auth.uid() or public.is_staff());

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports for insert
to authenticated
with check (operator_id = auth.uid());

drop policy if exists "reports_update_owner_or_staff" on public.reports;
create policy "reports_update_owner_or_staff"
on public.reports for update
to authenticated
using (operator_id = auth.uid() or public.is_staff())
with check (operator_id = auth.uid() or public.is_staff());

drop policy if exists "reports_delete_owner_or_staff" on public.reports;
create policy "reports_delete_owner_or_staff"
on public.reports for delete
to authenticated
using (operator_id = auth.uid() or public.is_staff());

drop policy if exists "report_files_select_owner_or_staff" on public.report_files;
create policy "report_files_select_owner_or_staff"
on public.report_files for select
to authenticated
using (user_id = auth.uid() or public.is_staff());

drop policy if exists "report_files_insert_own" on public.report_files;
create policy "report_files_insert_own"
on public.report_files for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notifications_insert_authenticated" on public.notifications;
create policy "notifications_insert_authenticated"
on public.notifications for insert
to authenticated
with check (true);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "calendar_select_authenticated" on public.calendar_events;
create policy "calendar_select_authenticated"
on public.calendar_events for select
to authenticated
using (true);

drop policy if exists "calendar_insert_staff" on public.calendar_events;
create policy "calendar_insert_staff"
on public.calendar_events for insert
to authenticated
with check (public.is_staff());

drop policy if exists "calendar_delete_staff" on public.calendar_events;
create policy "calendar_delete_staff"
on public.calendar_events for delete
to authenticated
using (public.is_staff());

drop policy if exists "audit_select_staff" on public.audit_logs;
create policy "audit_select_staff"
on public.audit_logs for select
to authenticated
using (public.is_staff());

drop policy if exists "audit_insert_authenticated" on public.audit_logs;
create policy "audit_insert_authenticated"
on public.audit_logs for insert
to authenticated
with check (true);

create or replace function public.wells_in_bounds(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns setof public.wells
language sql
stable
security invoker
as $$
  select *
  from public.wells
  where st_intersects(gis_point, st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography)
  order by code;
$$;

insert into storage.buckets (id, name, public)
values ('report-files', 'report-files', true)
on conflict (id) do nothing;

drop policy if exists "report_files_storage_select_authenticated" on storage.objects;
create policy "report_files_storage_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'report-files');

drop policy if exists "report_files_storage_insert_own" on storage.objects;
create policy "report_files_storage_insert_own"
on storage.objects for insert
to authenticated
with check (bucket_id = 'report-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "report_files_storage_delete_own_or_staff" on storage.objects;
create policy "report_files_storage_delete_own_or_staff"
on storage.objects for delete
to authenticated
using (bucket_id = 'report-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
