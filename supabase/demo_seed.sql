-- MUNAI demo data for Supabase.
-- Run supabase/schema.sql first.
-- Then create these Auth users in Supabase Dashboard -> Authentication -> Users:
--   operator@munai.kz / demo1234
--   manager@munai.kz  / demo1234
--   director@munai.kz / demo1234
--   admin@munai.kz    / demo1234
-- After that, run this file in the SQL editor.

update public.profiles
set
  name = 'Айбек Сарсенов',
  role = 'operator',
  position = 'Оператор по добыче нефти',
  region = 'Месторождение Узень-3',
  active = true
where email = 'operator@munai.kz';

update public.profiles
set
  name = 'Дана Жумабекова',
  role = 'manager',
  position = 'Менеджер участка',
  region = 'Участок Северный',
  active = true
where email = 'manager@munai.kz';

update public.profiles
set
  name = 'Ержан Касымов',
  role = 'director',
  position = 'Директор по добыче',
  region = 'Регион Мангистау',
  active = true
where email = 'director@munai.kz';

update public.profiles
set
  name = 'Админ Системы',
  role = 'admin',
  position = 'Системный администратор',
  region = 'HQ',
  active = true
where email = 'admin@munai.kz';

with demo_users as (
  select
    (select id from public.profiles where email = 'operator@munai.kz') as operator_id,
    (select id from public.profiles where email = 'manager@munai.kz') as manager_id
)
insert into public.wells (
  code,
  name,
  status,
  product,
  "production24h",
  temperature,
  tubing_internal_p,
  tubing_external_p,
  annulus_p,
  pump_strokes,
  lat,
  lng,
  operator_id,
  manager_id
)
select *
from (
  values
    ('UZ-101', 'Скважина №101', 'active', 'oil', 62, 67, 118, 42, 7, 6, 43.645, 52.875),
    ('UZ-102', 'Скважина №102', 'active', 'oil', 58, 64, 112, 39, 6, 7, 43.651, 52.889),
    ('UZ-103', 'Скважина №103', 'warning', 'oil', 18, 82, 146, 54, 11, 4, 43.662, 52.897),
    ('UZ-104', 'Скважина №104', 'warning', 'oil', 22, 94, 165, 59, 12, 3, 43.669, 52.908),
    ('UZ-105', 'Скважина №105', 'active', 'gas', 71, 61, 108, 35, 5, 8, 43.676, 52.919),
    ('UZ-106', 'Скважина №106', 'inactive', 'condensate', 0, 38, 0, 0, 0, 0, 43.684, 52.927),
    ('UZ-107', 'Скважина №107', 'active', 'oil', 49, 69, 120, 43, 8, 6, 43.692, 52.936),
    ('UZ-108', 'Скважина №108', 'broken', 'oil', 7, 88, 172, 61, 15, 2, 43.701, 52.945)
) as well_data (
  code,
  name,
  status,
  product,
  production24h,
  temperature,
  tubing_internal_p,
  tubing_external_p,
  annulus_p,
  pump_strokes,
  lat,
  lng
)
cross join demo_users
where demo_users.operator_id is not null
  and demo_users.manager_id is not null
on conflict (code) do update
set
  name = excluded.name,
  status = excluded.status,
  product = excluded.product,
  "production24h" = excluded."production24h",
  temperature = excluded.temperature,
  tubing_internal_p = excluded.tubing_internal_p,
  tubing_external_p = excluded.tubing_external_p,
  annulus_p = excluded.annulus_p,
  pump_strokes = excluded.pump_strokes,
  lat = excluded.lat,
  lng = excluded.lng,
  operator_id = excluded.operator_id,
  manager_id = excluded.manager_id;

delete from public.reports
where well_id in (
  select id
  from public.wells
  where code in ('UZ-101', 'UZ-104', 'UZ-108')
)
and operator_id = (select id from public.profiles where email = 'operator@munai.kz');

delete from public.notifications
where title in ('AI: Аномалия на UZ-104', 'Отчёт одобрен', 'Запрос на доработку')
and user_id in (
  select id
  from public.profiles
  where email in ('operator@munai.kz', 'manager@munai.kz')
);

delete from public.calendar_events
where title = 'Плановый осмотр UZ-104';

delete from public.audit_logs
where target in ('UZ-104', 'UZ-101', 'UZ-108')
and action in ('Отметил аномалию', 'Создал отчёт', 'Проверила отчёт');

with ids as (
  select
    (select id from public.profiles where email = 'operator@munai.kz') as operator_id,
    (select id from public.wells where code = 'UZ-101') as uz101,
    (select id from public.wells where code = 'UZ-104') as uz104,
    (select id from public.wells where code = 'UZ-108') as uz108
)
insert into public.reports (
  well_id,
  operator_id,
  status,
  ai_score,
  summary,
  flag,
  temperature,
  "production24h",
  tubing_internal_p,
  tubing_external_p,
  annulus_p,
  pump_strokes,
  comment,
  created_at
)
select *
from (
  select uz101, operator_id, 'pending', 92, 'Параметры в норме, добыча стабильна.', null, 67, 62, 118, 42, 7, 6, 'Суточный замер', now() - interval '2 hours'
  from ids
  union all
  select uz104, operator_id, 'flagged', 41, 'Выявлено: критически высокая температура; высокое давление в НКТ.', 'Аномалия температуры', 94, 22, 165, 59, 12, 3, 'Нужна проверка', now() - interval '3 hours'
  from ids
  union all
  select uz108, operator_id, 'approved', 88, 'Стандартный суточный замер.', null, 88, 7, 172, 61, 15, 2, 'После ремонта', now() - interval '1 day'
  from ids
) as report_data (
  well_id,
  operator_id,
  status,
  ai_score,
  summary,
  flag,
  temperature,
  production24h,
  tubing_internal_p,
  tubing_external_p,
  annulus_p,
  pump_strokes,
  comment,
  created_at
)
where well_id is not null and operator_id is not null;

insert into public.notifications (user_id, icon, title, body, tone, unread, created_at)
select id, 'alert', 'AI: Аномалия на UZ-104', 'Температура выше нормы. Требуется проверка.', 'warning', true, now() - interval '15 minutes'
from public.profiles
where email = 'manager@munai.kz';

insert into public.calendar_events (title, date, event_type, created_by)
select 'Плановый осмотр UZ-104', current_date + 1, 'Осмотр', id
from public.profiles
where email = 'manager@munai.kz'
on conflict do nothing;

insert into public.audit_logs (who, action, target)
values
  ('AI Engine', 'Отметил аномалию', 'UZ-104'),
  ('Айбек С. (operator)', 'Создал отчёт', 'UZ-101'),
  ('Дана Ж. (manager)', 'Проверила отчёт', 'UZ-108');
