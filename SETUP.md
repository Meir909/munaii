# MUNAI — настройка Supabase + OpenAI

## 1. Supabase (основная БД)

1. Создайте проект на [supabase.com](https://supabase.com)
2. SQL Editor → выполните `supabase/schema.sql`
3. Затем `supabase/migrations/20260603_ai_report_columns.sql`
4. (Опционально) `supabase/demo_seed.sql` — демо-скважины
5. Authentication → Users → создайте пользователей или используйте Register в приложении
6. **Authentication → URL Configuration** (иначе письма ведут на localhost):
   - **Site URL**: `https://ваш-сайт.vercel.app` (ваш реальный адрес на Vercel)
   - **Redirect URLs** (добавьте все):
     - `https://ваш-сайт.vercel.app/**`
     - `http://localhost:5173/**` (для локальной разработки)

## 2. Переменные фронтенда

Скопируйте в `munai-digital-oilfield-ops-main/.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SITE_URL=https://ваш-сайт.vercel.app
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

Также добавьте для сборки фронтенда: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, **`VITE_SITE_URL`** (тот же URL, что Site URL в Supabase).

## 4. Запуск

```bash
cd munai-master
npx vercel dev
```

## 5. Функции AI

- **AI-отчёт** — `/api/ai/generate-report-draft` → сохранение в Supabase
- **Голос** — запись → `/api/ai/transcribe` (Whisper) → `/api/ai/parse-voice` (GPT)
