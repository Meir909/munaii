# MUNAI Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `schema.sql`.
3. **Authentication → URL Configuration**: set **Site URL** to your production URL (e.g. `https://your-app.vercel.app`), add **Redirect URLs** `https://your-app.vercel.app/**` and `http://localhost:5173/**`.
4. In Authentication -> Users, create demo users:
   - `operator@munai.kz` / `demo1234`
   - `manager@munai.kz` / `demo1234`
   - `director@munai.kz` / `demo1234`
   - `admin@munai.kz` / `demo1234`
5. Open SQL Editor again and run `demo_seed.sql`.
6. Copy frontend `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SITE_URL` (same as Site URL above)
7. Start the frontend:
   - `npm run dev`

The frontend still has an offline fallback for emergency demos, but real auth, profiles,
wells, reports, files, notifications, calendar events and audit logs use Supabase when
the two Supabase env vars are present.
