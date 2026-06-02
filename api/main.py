from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, get_connection
from app.seed import seed_db
from app.routers import auth, wells, reports, users, notifications, calendar, dashboard, audit, ai


def create_app() -> FastAPI:
    init_db()
    conn = get_connection()
    try:
        seed_db(conn)
    finally:
        conn.close()

    app = FastAPI(
        title="MUNAI API",
        description="AI Digital Oilfield Operations Platform API",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api")
    app.include_router(wells.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(notifications.router, prefix="/api")
    app.include_router(calendar.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(audit.router, prefix="/api")
    app.include_router(ai.router, prefix="/api")

    @app.get("/")
    def root():
        return {"status": "ok", "service": "MUNAI API", "version": "1.0.0"}

    @app.get("/health")
    def health():
        return {"status": "healthy"}

    return app


app = create_app()
