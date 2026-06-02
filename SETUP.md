# MUNAI — настройка Supabase + OpenAI

## 1. Supabase (основная БД)

1. Создайте проект на [supabase.com](https://supabase.com)
2. SQL Editor → выполните `supabase/schema.sql`
3. Затем `supabase/migrations/20260603_ai_report_columns.sql`
4. (Опционально) `supabase/demo_seed.sql` — демо-скважины
5. Authentication → Users → создайте пользователей или используйте Register в приложении

## 2. Переменные фронтенда

Скопируйте в `munai-digital-oilfield-ops-main/.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=/api
```

## 3. Vercel (AI + API)

В **Project Settings → Environment Variables**:

| Переменная | Назначение |
|------------|------------|
| `OPENAI_API_KEY` | GPT + Whisper (отчёты, голос) |
| `OPENAI_MODEL` | `gpt-4o-mini` (по умолчанию) |
| `OPENAI_BUDGET_USD` | Лимит расходов OpenAI, по умолчанию **$2** — после этого AI блокируется |
| `OPENAI_MAX_TOKENS` | Учёт токенов (статистика), блокировка только по `$` |
| `AI_USAGE_FILE` | Файл учёта расхода (на Vercel: `/tmp/munai_ai_usage.json`) |
| `SUPABASE_JWT_SECRET` | JWT Secret из Supabase → Settings → API |

Также добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` для сборки фронтенда.

## 4. Запуск

```bash
cd munai-master
npx vercel dev
```

## 5. Функции AI

- **AI-отчёт** — `/api/ai/generate-report-draft` → сохранение в Supabase
- **Голос** — запись → `/api/ai/transcribe` (Whisper) → `/api/ai/parse-voice` (GPT)
