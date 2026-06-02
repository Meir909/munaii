"""Notification helpers."""
import uuid
from datetime import datetime
from sqlite3 import Connection


def broadcast_notification(
    db: Connection,
    *,
    icon: str,
    title: str,
    body: str,
    tone: str = "info",
    exclude_user_id: str | None = None,
) -> None:
    """Create the same notification for every active user."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    rows = db.execute("SELECT id FROM users WHERE active=1").fetchall()
    for row in rows:
        if exclude_user_id and row["id"] == exclude_user_id:
            continue
        db.execute(
            "INSERT INTO notifications(id,user_id,icon,title,body,tone,unread,created_at) "
            "VALUES(?,?,?,?,?,?,1,?)",
            (str(uuid.uuid4()), row["id"], icon, title, body, tone, now),
        )
