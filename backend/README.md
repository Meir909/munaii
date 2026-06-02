# Legacy Backend

The active backend is now `api/main.py`.

`backend/` is kept only as a historical local FastAPI prototype. Do not add new
features here unless the project deliberately moves back to a separate backend
deployment. Vercel uses `api/index.py`, which imports the shared app from
`api/main.py`.
